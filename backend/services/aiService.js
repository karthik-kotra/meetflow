const Meeting = require('../models/Meeting');
const MeetingMessage = require('../models/MeetingMessage');
const storageService = require('./storage/index');

/**
 * Transcribes audio using Groq's Whisper API.
 * @param {Buffer} fileBuffer Binary audio file data
 * @param {string} mimeType Mime-type (e.g. video/webm or audio/webm)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(fileBuffer, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in environment variables.');
  }

  console.log(`[aiService] Transcribing audio with size: ${fileBuffer.length} bytes, mimeType: ${mimeType}`);

  // Create native FormData (supported natively in Node 22.15.0)
  const formData = new FormData();
  
  // Convert Buffer to Blob for standard FormData compatibility
  const blob = new Blob([fileBuffer], { type: mimeType });
  
  // Groq requires a valid file name extension to determine format
  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  formData.append('file', blob, `recording.${extension}`);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API returned error status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.text || '';
}

/**
 * Generates meeting summary and action items using the Groq LLM (llama-3.3-70b-versatile).
 * Relies on the chat transcript and meeting notes saved in MongoDB.
 * @param {string} meetingId MongoDB ID of the meeting
 * @returns {Promise<object>} The updated meeting document
 */
async function generateSummaryAndActionItems(meetingId) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new Error(`Meeting with ID ${meetingId} not found.`);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in environment variables.');
  }

  // Fetch all messages (both spoken transcript segments and room chats)
  const messages = await MeetingMessage.find({ roomId: meeting.roomId }).sort({ createdAt: 1 });

  const formattedLogs = messages.map(m => {
    const time = m.createdAt ? m.createdAt.toISOString() : new Date().toISOString();
    if (m.type === 'transcript') {
      return `[${time}] (Spoken) ${m.senderName}: ${m.text}`;
    } else if (m.type === 'system') {
      return `[${time}] (System): ${m.text}`;
    } else {
      return `[${time}] (Chat) ${m.senderName}: ${m.text}`;
    }
  }).join('\n');

  const systemPrompt = `You are an AI meeting assistant. Your task is to analyze the provided meeting details, transcripts, chat logs, and shared notes, then generate:
1. A concise meeting summary.
2. A list of actionable items with proposed titles, assignee names, and priority levels.

You MUST reply ONLY with a JSON object matching the following structure:
{
  "summary": "Markdown-formatted summary of the meeting. Include headers, bullet points, and key takeaways.",
  "actionItems": [
    {
      "task": "Clean and concise task description",
      "priority": "high", // must be 'high', 'medium', or 'low'
      "assigneeName": "Name of the person who should do this task, or leave blank if unspecified"
    }
  ]
}

Do not include any extra text, markdown code blocks (such as \`\`\`json), or explanations outside of the JSON.`;

  const userPrompt = `
Meeting Title: ${meeting.title}
Meeting Description: ${meeting.description || '(No description)'}
Shared Notes: ${meeting.notes || '(No notes saved)'}

Meeting Logs (Chat & Spoken Transcript):
${formattedLogs || '(No chat or transcript recorded)'}
`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq LLM API returned error status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const contentText = result.choices?.[0]?.message?.content;
  if (!contentText) {
    throw new Error('Invalid response structure from Groq Chat Completions API.');
  }

  let aiData;
  try {
    aiData = JSON.parse(contentText);
  } catch (parseErr) {
    console.error('Failed to parse AI content as JSON:', contentText);
    throw new Error('AI output could not be parsed as valid JSON.');
  }

  // Update meeting model
  meeting.summary = aiData.summary || 'Summary could not be generated.';
  meeting.actionItems = (aiData.actionItems || []).map(item => ({
    task: item.task,
    priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
    assigneeName: item.assigneeName || ''
  }));
  meeting.aiProcessed = true;

  await meeting.save();

  // Populate host and participants for UI compatibility
  const populated = await Meeting.findById(meeting._id)
    .populate('host', 'name email')
    .populate('participants', 'name email');

  return populated;
}

/**
 * Orchestrates background audio transcription and summary generation,
 * followed by deleting the temporary recording data from Redis storage.
 * @param {string} meetingId MongoDB ID of the meeting
 * @param {string} fileKey Key in temporary storage
 * @param {string} mimeType Mimetype of the recording
 * @param {object} io Socket.io instance for sending real-time update notifications
 */
async function processRecordingAndSummary(meetingId, fileKey, mimeType, io) {
  console.log(`[aiService] Starting background processing for meeting: ${meetingId}, fileKey: ${fileKey}`);

  try {
    // 1. Download file from StorageService (retrieves binary buffer from Redis)
    const fileBuffer = await storageService.download(fileKey);
    
    // 2. Transcribe recording audio via Groq Whisper API
    let transcribedText = '';
    try {
      transcribedText = await transcribeAudio(fileBuffer, mimeType);
      console.log(`[aiService] Transcription completed. Length: ${transcribedText.length} characters.`);
    } catch (transcribeErr) {
      console.error(`❌ [aiService] Whisper audio transcription failed:`, transcribeErr);
      // We log the error but do not throw, so that summary and action items are still compiled from notes/chats
    }

    // 3. Save the transcript text as a MeetingMessage segment associated with the room
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      throw new Error(`Meeting with ID ${meetingId} was deleted during background processing.`);
    }

    if (transcribedText && transcribedText.trim()) {
      await MeetingMessage.create({
        roomId: meeting.roomId,
        senderName: 'AI Transcriber',
        text: transcribedText,
        type: 'transcript'
      });
      console.log(`[aiService] Saved transcription text into MeetingMessage database logs.`);
    }

    // 4. Generate AI summary and extract action items
    console.log(`[aiService] Generating summary and extracting action items for meeting roomId: ${meeting.roomId}`);
    const updatedMeeting = await generateSummaryAndActionItems(meetingId);

    // 5. Clean up temporary storage if it is a transient cache (like Redis)
    if (storageService.isTemporary) {
      console.log(`[aiService] AI processing successful. Running temporary storage cleanup...`);
      await storageService.delete(fileKey);
    }

    // 6. Broadcast socket update so UI refreshes automatically
    if (io) {
      console.log(`[aiService] Broadcasting meeting_ai_ready socket event for roomId: ${meeting.roomId}`);
      io.to(`meeting_${meeting.roomId}`).emit('meeting_ai_ready', {
        meetingId,
        roomId: meeting.roomId,
        summary: updatedMeeting.summary,
        actionItems: updatedMeeting.actionItems,
        recordingUrl: updatedMeeting.recordingUrl || null
      });

    }

    console.log(`[aiService] Background processing successfully finalized for meeting: ${meetingId}`);
  } catch (error) {
    console.error(`❌ [aiService] Error during background processing for meeting ${meetingId}:`, error);
    
    // Attempt storage cleanup even in case of failure to avoid memory leaks (only if temporary cache)
    try {
      if (storageService.isTemporary) {
        console.log(`[aiService] Attempting cleanup after processing failure for key: ${fileKey}`);
        await storageService.delete(fileKey);
      }
    } catch (cleanupErr) {
      console.error(`[aiService] Double fault: Failed to clean up fileKey ${fileKey} after error:`, cleanupErr);
    }

    // Broadcast error state via socket if possible
    if (io) {
      try {
        const meeting = await Meeting.findById(meetingId);
        if (meeting) {
          io.to(`meeting_${meeting.roomId}`).emit('meeting_ai_error', {
            meetingId,
            message: error.message || 'AI processing failed.'
          });
        }
      } catch (err) {
        // Ignore
      }
    }
  }
}

module.exports = {
  transcribeAudio,
  generateSummaryAndActionItems,
  processRecordingAndSummary
};
