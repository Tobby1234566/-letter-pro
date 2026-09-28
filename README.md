# LetterPro — Professional Letter Writing Service

A full-stack letter writing service with user authentication, request management, and email delivery.

## Features

- User registration and authentication
- Create letter requests (picture or description)
- Upload payment receipts
- Admin dashboard for managing requests
- Email notifications via SMTP

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (file-based)
- **Auth**: express-session
- **Email**: Nodemailer
- **File Upload**: Multer

## Setup

```bash
# Install dependencies
npm install

# Set environment variables (create .env file)
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start
```

## Environment Variables

```bash
PORT=3000
SESSION_SECRET=your-secret-key-here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
BANK_NAME=Your Bank Name
ACCOUNT_NAME=Your Account Name
ACCOUNT_NUMBER=Your Account Number
```

## Deployment

### Render.com

1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Set environment variables in Render dashboard
4. Deploy!

**Render Config:**
- Build Command: `npm install`
- Start Command: `node server.js`
- Instance Type: Free (development) or Starter (production)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### User Requests
- `POST /api/requests` - Create new request
- `GET /api/requests/mine` - Get user's requests
- `GET /api/requests/:id` - Get specific request
- `POST /api/requests/:id/receipt` - Upload payment receipt

### Admin
- `GET /api/admin/requests` - Get all requests (with filters)
- `GET /api/admin/requests/:id` - Get request details
- `PUT /api/admin/requests/:id/status` - Update status
- `PUT /api/admin/requests/:id/letter` - Save letter content
- `PUT /api/admin/requests/:id/mark-paid` - Mark as paid
- `POST /api/admin/requests/:id/send` - Send letter via email

## Default Admin Account

- Email: `admin@letterservice.com`
- Password: `admin123`

## License

Private project.
