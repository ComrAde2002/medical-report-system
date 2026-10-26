require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
// pdf-parse v1.x exports the function directly
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 8000;

// Initialize Groq AI client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // For parsing application/json
app.use(
  fileUpload({
    createParentPath: true, // Creates the directory path if it doesn't exist
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
  })
);

// Serve static files from the 'assets' directory
const assetsDir = path.join(__dirname, "assets");
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
app.use("/assets", express.static(assetsDir));

// Store temporary file info (in production, use Redis or a database)
const tempFiles = new Map();

// Upload endpoint - saves to temp first, waits for Firebase confirmation
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files were uploaded." });
    }

    // Get userId from request body or header
    const userId = req.body.userId || req.headers["x-user-id"];
    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const uploadedFile = req.files.pdf; // File input name is 'pdf' but accepts PDFs and images

    // Validate file type
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
      return res.status(400).json({
        message:
          "Invalid file type. Only PDFs and images (JPG, PNG, GIF, BMP, WEBP) are allowed.",
      });
    }

    // Generate unique temp file ID
    const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(tempDir, `${tempId}-${uploadedFile.name}`);

    // Save to temporary location
    await uploadedFile.mv(tempFilePath);

    // Generate final file name with timestamp
    const timestamp = Date.now();
    const fileName = `${timestamp}-${uploadedFile.name}`;
    const finalRelativePath = `assets/${userId}/${fileName}`;

    // Store temp file info
    tempFiles.set(tempId, {
      tempPath: tempFilePath,
      userId: userId,
      fileName: fileName,
      originalName: uploadedFile.name,
      finalPath: path.join(assetsDir, userId, fileName),
      finalRelativePath: finalRelativePath,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size,
      createdAt: Date.now(),
    });

    // Clean up temp files older than 1 hour
    setTimeout(() => {
      if (tempFiles.has(tempId)) {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          tempFiles.delete(tempId);
        } catch (err) {
          console.error("Error cleaning up temp file:", err);
        }
      }
    }, 3600000); // 1 hour

    res.json({
      status: true,
      message:
        "File uploaded to temporary storage. Awaiting Firebase confirmation.",
      data: {
        tempId: tempId,
        originalName: uploadedFile.name,
        mimetype: uploadedFile.mimetype,
        size: uploadedFile.size,
        // Don't return final paths yet - only after confirmation
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: err.message || "File upload failed." });
  }
});

// Confirm endpoint - moves file from temp to final location after Firebase success
app.post("/upload/confirm", async (req, res) => {
  try {
    const { tempId } = req.body;
    if (!tempId) {
      return res.status(400).json({ message: "Temp ID is required." });
    }

    const tempFileInfo = tempFiles.get(tempId);
    if (!tempFileInfo) {
      return res
        .status(404)
        .json({ message: "Temporary file not found or expired." });
    }

    // Create user directory if it doesn't exist
    const userDir = path.join(assetsDir, tempFileInfo.userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Move file from temp to final location
    if (!fs.existsSync(tempFileInfo.tempPath)) {
      return res
        .status(404)
        .json({ message: "Temporary file no longer exists." });
    }

    fs.renameSync(tempFileInfo.tempPath, tempFileInfo.finalPath);

    // Construct file URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const fileUrl = `${baseUrl}/${tempFileInfo.finalRelativePath}`;

    // Remove from temp files map
    tempFiles.delete(tempId);

    res.json({
      status: true,
      message: "File confirmed and moved to final location.",
      data: {
        name: tempFileInfo.fileName,
        originalName: tempFileInfo.originalName,
        mimetype: tempFileInfo.mimetype,
        size: tempFileInfo.size,
        url: fileUrl,
        filePath: tempFileInfo.finalRelativePath,
        userId: tempFileInfo.userId,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Confirm error:", err);
    res
      .status(500)
      .json({ message: err.message || "File confirmation failed." });
  }
});

// Delete endpoint - removes temp file if Firebase save fails
app.post("/upload/cancel", async (req, res) => {
  try {
    const { tempId } = req.body;
    if (!tempId) {
      return res.status(400).json({ message: "Temp ID is required." });
    }

    const tempFileInfo = tempFiles.get(tempId);
    if (tempFileInfo && fs.existsSync(tempFileInfo.tempPath)) {
      fs.unlinkSync(tempFileInfo.tempPath);
    }
    tempFiles.delete(tempId);

    res.json({
      status: true,
      message: "Temporary file deleted.",
    });
  } catch (err) {
    console.error("Cancel error:", err);
    res
      .status(500)
      .json({ message: err.message || "File cancellation failed." });
  }
});

// Delete endpoint - deletes a file from assets folder
app.delete("/files/:userId/:fileName", async (req, res) => {
  try {
    const { userId, fileName } = req.params;

    if (!userId || !fileName) {
      return res
        .status(400)
        .json({ message: "User ID and file name are required." });
    }

    // Construct file path
    const filePath = path.join(assetsDir, userId, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found." });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    // Optionally: Remove user directory if it's empty
    const userDir = path.join(assetsDir, userId);
    try {
      const files = fs.readdirSync(userDir);
      if (files.length === 0) {
        fs.rmdirSync(userDir);
      }
    } catch (err) {
      // Ignore error if directory is not empty or can't be removed
    }

    res.json({
      status: true,
      message: "File deleted successfully.",
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: err.message || "File deletion failed." });
  }
});

// Analyze endpoint - extracts text from all user files and generates AI summaries
app.post("/analyze", async (req, res) => {
  try {
    const { userId, filePaths } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ message: "File paths array is required." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res
        .status(500)
        .json({ message: "Groq API key is not configured." });
    }

    let allExtractedText = "";

    // Extract text from each file
    for (const filePath of filePaths) {
      const fullPath = path.join(__dirname, filePath);

      if (!fs.existsSync(fullPath)) {
        console.warn(`File not found: ${fullPath}`);
        continue;
      }

      const fileExtension = path.extname(fullPath).toLowerCase();
      const mimeType = req.body.mimeTypes?.[filePaths.indexOf(filePath)] || "";

      try {
        if (fileExtension === ".pdf" || mimeType.includes("pdf")) {
          // Extract text from PDF
          const dataBuffer = fs.readFileSync(fullPath);
          const pdfData = await pdfParse(dataBuffer);
          allExtractedText += `\n\n--- Document: ${path.basename(
            filePath
          )} ---\n\n`;
          allExtractedText += pdfData.text;
        } else if (
          mimeType.startsWith("image/") ||
          [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(
            fileExtension
          )
        ) {
          // Extract text from image using OCR
          const {
            data: { text },
          } = await Tesseract.recognize(fullPath, "eng", {
            logger: (m) => {
              // Optional: log OCR progress
              if (m.status === "recognizing text") {
                console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
              }
            },
          });
          allExtractedText += `\n\n--- Document: ${path.basename(
            filePath
          )} ---\n\n`;
          allExtractedText += text;
        }
      } catch (err) {
        console.error(`Error extracting text from ${filePath}:`, err);
        allExtractedText += `\n\n--- Document: ${path.basename(
          filePath
        )} ---\n\n`;
        allExtractedText += `[Error: Could not extract text from this file]`;
      }
    }

    if (!allExtractedText.trim()) {
      return res.status(400).json({
        message: "No text could be extracted from the provided files.",
      });
    }

    // Debug: Log extracted text info
    console.log("Extracted text length:", allExtractedText.length);
    console.log(
      "Extracted text preview (first 500 chars):",
      allExtractedText.substring(0, 500)
    );

    // Create comprehensive medical analysis prompt
    const prompt = `You are an expert medical AI assistant. Analyze the following extracted text from patient medical reports and generate two comprehensive summaries.

MEDICAL REPORTS TEXT:
${allExtractedText}

Please provide a detailed analysis with the following structure:

1. PATIENT SUMMARY (Simple & Easy to Understand):
   - Write in plain, non-medical language that a patient can easily understand
   - Highlight key health findings in simple terms
   - Mention any important numbers or values in context (e.g., "Your blood sugar is slightly elevated")
   - Include any recommendations or next steps in simple language
   - Keep it friendly, reassuring, and informative
   - Format with clear sections if needed

2. DOCTOR SUMMARY (Technical & Clinical):
   - Write in professional medical terminology
   - Include all relevant clinical findings, test results, and measurements
   - Highlight abnormal values with reference ranges where applicable
   - List diagnoses, conditions, or medical observations
   - Include medication information if present
   - Note any trends or comparisons if multiple reports are provided
   - Use proper medical abbreviations and terminology
   - Format with clear sections: Findings, Test Results, Diagnosis, Recommendations

IMPORTANT GUIDELINES:
- Be accurate and factual based only on the provided text
- If information is unclear or missing, note it appropriately
- For patient summary, avoid medical jargon; explain terms when necessary
- For doctor summary, use precise medical terminology
- Highlight any urgent findings or abnormal values in both summaries
- Maintain patient privacy - do not infer information not present in the reports

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any markdown code blocks, explanations, or extra text. The response must be valid JSON that can be parsed directly.

Format your response EXACTLY as follows (no markdown, no code blocks, just pure JSON):
{
  "patient_summary": "Your detailed patient-friendly summary here. Use \\n for line breaks within the text.",
  "doctor_summary": "Your detailed clinical summary here. Use \\n for line breaks within the text."
}

IMPORTANT: 
- Escape all newlines as \\n within JSON string values
- Do not use actual line breaks inside JSON string values
- Return ONLY the JSON object, nothing else`;

    // Call Groq AI
    console.log("Calling Groq AI with prompt length:", prompt.length);
    let completion;
    try {
      completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an expert medical AI assistant specializing in analyzing medical reports and generating clear, accurate summaries for both patients and healthcare professionals.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3, // Lower temperature for more consistent, factual responses
        max_tokens: 4000,
      });
      console.log("Groq API call successful");
      console.log("Completion object keys:", Object.keys(completion));
      console.log("Choices length:", completion.choices?.length);
    } catch (groqError) {
      console.error("Groq API error:", groqError);
      return res.status(500).json({
        message: "Failed to get response from Groq AI",
        error: groqError.message,
      });
    }

    const aiResponse = completion.choices[0]?.message?.content || "";

    if (!aiResponse) {
      console.error("Empty response from Groq AI");
      console.error(
        "Full completion object:",
        JSON.stringify(completion, null, 2)
      );
      return res.status(500).json({
        message: "Groq AI returned an empty response",
      });
    }

    // Debug: Log Groq response
    console.log("Groq AI Response length:", aiResponse.length);
    console.log(
      "Groq AI Response (first 1000 chars):",
      aiResponse.substring(0, 1000)
    );
    console.log(
      "Groq AI Response (last 500 chars):",
      aiResponse.substring(Math.max(0, aiResponse.length - 500))
    );

    let parsedResponse;

    try {
      // Try parsing Groq’s output as JSON
      parsedResponse = JSON.parse(aiResponse);
    } catch (err) {
      // If Groq returned plain text instead of JSON, handle it safely
      console.error("Error parsing Groq response:", err);
      parsedResponse = {
        patient_summary:
          aiResponse.split("Doctor Summary")[0]?.trim() ||
          "Summary not available.",
        doctor_summary:
          aiResponse.split("Doctor Summary")[1]?.trim() ||
          "Summary not available.",
      };
    }

    res.json({
      status: true,
      message: "Analysis completed successfully.",
      data: {
        patient_summary: parsedResponse.patient_summary,
        doctor_summary: parsedResponse.doctor_summary,
        extracted_text_length: allExtractedText.length,
        files_processed: filePaths.length,
      },
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({
      message: err.message || "Analysis failed.",
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend server running on port http://localhost:${PORT}/`);
});
