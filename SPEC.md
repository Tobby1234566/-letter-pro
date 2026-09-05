# SPEC.md — Letter Writing Service

> **Status**: ✅ Implemented and Running

## 1. Concept & Vision

A professional, trustworthy letter writing service that helps users get expertly crafted letters delivered to their email. Users can upload a picture (handwritten text or document) or describe their letter need, and the admin writes a polished letter and sends it back. Clean, warm, and approachable — like hiring a personal assistant.

## 2. Design Language

**Aesthetic**: Professional warmth — clean, trustworthy, slightly creative. Inspired by modern SaaS tools like Notion and Linear but with a friendlier, more human touch.

**Color Palette**:
- Background: `#fafaf9` (warm off-white)
- Surface: `#ffffff` (cards)
- Border: `#e7e5e4`
- Text Primary: `#1c1917` (warm black)
- Text Secondary: `#78716c`
- Accent: `#2563eb` (professional blue)
- Accent Hover: `#1d4ed8`
- Success: `#16a34a`
- Warning: `#ca8a04`

**Typography**:
- Headings: `DM Sans` (modern, friendly, geometric)
- Body: `Inter` (clean, readable)
- Monospace for codes/prices: `JetBrains Mono`

**Spacing**: 8px base unit. Generous section padding (60-100px vertical).

**Motion**:
- Subtle fade-in on scroll
- Hover lifts on cards (translateY -2px)
- Button press feedback (scale 0.98)
- Smooth page transitions

**Visual Assets**:
- Lucide icons via CDN
- No external images needed
- CSS-generated decorative elements

## 3. Layout & Structure

### Public Pages
```
[Landing Page]
- Hero: Headline, subtext, CTA to sign up
- How It Works: 3-step process (Upload/Describe → We Write → Delivered)
- Pricing: 3 tiers (Fast/Medium/Normal) + free trial mention
- FAQ section
- Footer with contact info

[Login / Register Pages]
- Centered card layout
- Minimal, focused forms
```

### User Dashboard
```
[Sidebar Navigation]
- Logo
- Dashboard (home)
- New Request
- My Requests
- Account Settings
- Logout

[Main Content Area]
- Welcome message with user name
- Stats cards (total requests, pending, completed)
- Recent requests list
```

### Admin Dashboard
```
[Sidebar Navigation]
- Logo
- Dashboard
- All Requests
- Completed Letters
- Settings
- Logout

[Main Content Area]
- Stats overview
- Pending requests table
- Quick actions (view, write letter, mark paid, send)
```

## 4. Features & Interactions

### Authentication
- **Register**: Name, Email, Password (min 8 chars)
- **Login**: Email + Password
- Session-based auth with secure cookies
- Protected routes (user dashboard, admin)

### User Features
- **New Request**:
  - Toggle: "Upload Picture" OR "Describe Letter Need"
  - If Picture: File upload (jpg, png, pdf, max 5MB), email subject field
  - If Description: Dropdown for letter type (Recommendation, Cover, Complaint, Request, Thank You, Other), textarea for details, recipient email field
  - Priority selection: Fast (₦5000), Medium (₦2500), Normal (₦1000)
  - Submit creates pending request

- **My Requests**:
  - Table/list of all user's requests
  - Status badges: Pending, Paid, In Progress, Completed
  - View request details
  - For completed: Download/view letter, mark as received

### Admin Features
- **All Requests**:
  - Filterable table (status, priority, date)
  - Search by email or name
  - Actions per request: View Details, Write Letter, Mark Paid, Send Letter
  - Bulk actions

- **Write Letter**:
  - Rich text editor (simple textarea for now)
  - Shows original request details and uploaded image (if any)
  - Save as draft, Mark Complete

- **Send Letter**:
  - Preview the letter
  - Enter recipient email (pre-filled from request)
  - Send button → sends email with letter content
  - Request status → Completed

### Payment Tracking
- Admin sees payment status per request
- Manual "Mark as Paid" button
- Payment due shown in request details

### Free Trial
- New users get 1 free request (first request is free)
- Clearly indicated on pricing page

## 5. Component Inventory

| Component | States |
|---|---|
| Button (Primary) | default, hover, active (scale), disabled, loading |
| Button (Secondary) | default, hover, active, disabled |
| Input | default, focus (accent border), error (red border + message), disabled |
| Textarea | same as input |
| Select | default, focus, disabled |
| File Upload | default, dragover (highlighted), uploaded (shows filename), error |
| Card | default, hover (lift) |
| Badge | pending (yellow), paid (blue), in-progress (purple), completed (green) |
| Table Row | default, hover (highlight) |
| Modal | hidden, visible (fade in), closing (fade out) |
| Sidebar Nav Item | default, hover, active (accent color + bg) |

## 6. Technical Approach

### Stack
- **Backend**: Node.js + Express.js
- **Database**: SQLite (via better-sqlite3) - zero setup, file-based
- **Auth**: express-session with SQLite sessions
- **Email**: Nodemailer (SMTP configurable)
- **File Upload**: Multer (local storage in /uploads)
- **Frontend**: Vanilla HTML/CSS/JS (no build tools)

### Project Structure
```
/
├── server.js           # Express server + API routes
├── database.js         # SQLite setup + queries
├── package.json
├── uploads/            # Uploaded files storage
├── public/
│   ├── index.html      # Landing page
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html  # User dashboard
│   ├── admin.html      # Admin dashboard
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js     # Login/register logic
│       ├── dashboard.js
│       └── admin.js
└── emails/
    └── letter-email.html  # Email template
```

### API Endpoints

**Auth**
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

**Requests (User)**
- `POST /api/requests` - Create new request
- `GET /api/requests/mine` - Get user's requests
- `GET /api/requests/:id` - Get specific request

**Requests (Admin)**
- `GET /api/admin/requests` - Get all requests (with filters)
- `PUT /api/admin/requests/:id/status` - Update status
- `PUT /api/admin/requests/:id/letter` - Save letter content
- `POST /api/admin/requests/:id/send` - Send email with letter
- `PUT /api/admin/requests/:id/mark-paid` - Mark as paid

### Data Model

**Users**
```
id, name, email, password_hash, role (user|admin), created_at, trial_used
```

**Requests**
```
id, user_id, type (picture|description), letter_type, subject, description,
file_path, recipient_email, priority (fast|medium|normal),
price, status (pending|paid|in_progress|completed),
letter_content, created_at, updated_at
```

### Environment Variables
```
PORT=3000
SESSION_SECRET=your-secret-key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
FROM_EMAIL=noreply@letterservice.com
BASE_URL=http://localhost:3000
```
