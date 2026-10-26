# Groq AI API Setup Guide

## Step 1: Get Your Groq API Key

1. **Visit Groq Console**: Go to [https://console.groq.com/keys](https://console.groq.com/keys)
2. **Sign Up/Login**: Create an account or log in if you already have one
3. **Create API Key**:
   - Click on "Create API Key" or "API Keys" in the dashboard
   - Give it a name (e.g., "SMRS Medical Analysis")
   - Copy the API key immediately (you won't be able to see it again!)

## Step 2: Set Up Environment Variable

### Option A: Create .env file (Recommended)

1. In the `backend` folder, create a file named `.env`
2. Add your API key:

```env
GROQ_API_KEY=your_actual_api_key_here
PORT=8000
```

**Important**:

- Replace `your_actual_api_key_here` with your actual Groq API key
- Never commit the `.env` file to git (it's already in `.gitignore`)

### Option B: Set Environment Variable Directly

**On macOS/Linux:**

```bash
export GROQ_API_KEY=your_actual_api_key_here
```

**On Windows (PowerShell):**

```powershell
$env:GROQ_API_KEY="your_actual_api_key_here"
```

**On Windows (CMD):**

```cmd
set GROQ_API_KEY=your_actual_api_key_here
```

## Step 3: Restart Your Backend Server

After setting up the API key, restart your backend server:

```bash
cd backend
npm run dev
```

## Step 4: Test the Setup

1. Upload some medical reports (PDFs or images) to your dashboard
2. Click the "🔍 Analyze Reports" button
3. Wait for the analysis to complete
4. You should see two summaries: Patient Summary and Doctor Summary

## Troubleshooting

### Error: "Groq API key is not configured"

- Make sure you created the `.env` file in the `backend` folder
- Check that the variable name is exactly `GROQ_API_KEY` (case-sensitive)
- Restart your backend server after creating/updating `.env`

### Error: "Invalid API key"

- Verify your API key is correct (no extra spaces)
- Make sure you copied the full key from Groq console
- Check that your Groq account is active

### Analysis takes too long

- OCR (image text extraction) can take time for large images
- PDF extraction is usually faster
- Be patient, especially for multiple files

## Groq API Limits

- **Free Tier**: Currently offers generous free usage
- **Rate Limits**: Check [Groq documentation](https://console.groq.com/docs) for current limits
- **Model Used**: `llama-3.1-70b-versatile` (fast and accurate)

## Security Notes

⚠️ **Never**:

- Commit your `.env` file to git
- Share your API key publicly
- Hardcode your API key in the code

✅ **Always**:

- Use environment variables for API keys
- Keep your `.env` file in `.gitignore`
- Rotate your API keys if they're exposed
