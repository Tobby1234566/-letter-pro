# Deploy LetterPro to Render

## Step 1: Create a GitHub Repository

```bash
cd C:\Users\USER\Documents\letter-pro
git init
git add .
git commit -m "LetterPro v1 - Initial commit"
git branch -M main
git remote add origin https://github.com/Tobby1234566/letterpro.git
git push -u origin main
```

## Step 2: Deploy on Render

1. Go to https://render.com and sign up/login
2. Click **New** → **Web Service**
3. Connect your GitHub account
4. Select the `letterpro` repository
5. Configure:
   - **Name**: `letterpro`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Add environment variables (from `.env.example`):
   - `SESSION_SECRET` - generate a random string
   - `SMTP_HOST` - `smtp.gmail.com`
   - `SMTP_PORT` - `587`
   - `SMTP_USER` - your Gmail address
   - `SMTP_PASS` - Gmail App Password (not regular password)
   - `FROM_EMAIL` - noreply@yourdomain.com
   - `BANK_NAME` - Access Bank
   - `ACCOUNT_NAME` - AFOLARANMI OLUWATOBILOBA GBOLAHAN
   - `ACCOUNT_NUMBER` - 1962438360
7. Click **Create Web Service**

## Step 3: Access Your App

Your app will be live at: `https://letterpro.onrender.com`

## Default Login

- **Admin**: admin@letterservice.com / admin123
- **User**: Register a new account
