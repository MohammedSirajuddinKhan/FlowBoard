# FlowBoard - Kanban Board Application

A collaborative Kanban board with user authentication, task management, and persistent storage.

## Features

- **User Authentication**: Register, login, and logout with secure password hashing (bcrypt)
- **Personal Kanban Boards**: Each user has their own private board
- **Task Management**: Create, edit, delete, and organize tasks
- **Columns**: To Do, In Progress, and Done
- **Drag & Drop**: Move tasks between columns with smooth animations
- **Persistent Storage**: All changes saved to MongoDB
- **Responsive Design**: Works on desktop, tablet, and mobile

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB + Mongoose
- **Authentication**: Express Sessions
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Template Engine**: EJS

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas connection string)
- npm or yarn

## Installation

1. **Clone/Navigate to project:**

   ```bash
   cd FlowBoard
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Edit `.env` file with your configuration:

   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/flowboard
   SESSION_SECRET=your_super_secret_key_change_in_production
   NODE_ENV=development
   ```

4. **Ensure MongoDB is running:**

   ```bash
   # If using local MongoDB
   mongod
   ```

5. **Start the server:**

   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

6. **Open in browser:**
   ```
   http://localhost:5000
   ```

## Project Structure

```
FlowBoard/
├── server.js                 # Express server entry point
├── .env                      # Environment variables
├── package.json              # Dependencies
│
├── config/
│   └── db.js                # MongoDB connection
│
├── models/
│   ├── User.js              # User schema
│   └── Task.js              # Task schema
│
├── controllers/
│   ├── authController.js    # Auth logic (register, login, logout)
│   └── taskController.js    # Task CRUD operations
│
├── routes/
│   ├── authRoutes.js        # Auth endpoints
│   └── taskRoutes.js        # Task endpoints
│
├── middleware/
│   └── auth.js              # Authentication middleware
│
├── views/
│   ├── index.ejs            # Kanban board page
│   ├── login.ejs            # Login page
│   └── register.ejs         # Registration page
│
└── public/
    ├── style.css            # Stylesheet
    └── script.js            # Frontend JavaScript
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user (requires auth)

### Tasks

- `GET /api/tasks` - Get all tasks for user (requires auth)
- `POST /api/tasks` - Create new task (requires auth)
- `PUT /api/tasks/:taskId` - Update task (requires auth)
- `DELETE /api/tasks/:taskId` - Delete task (requires auth)
- `PUT /api/tasks/reorder/all` - Reorder tasks (requires auth)

## Usage

1. **Create Account**: Click "Register here" on the login page
2. **Login**: Enter your credentials
3. **Add Tasks**: Click "Add New Task" button
4. **Drag Tasks**: Drag tasks between columns to change status
5. **Edit Tasks**: Click "Edit" button on a task
6. **Delete Tasks**: Click "Delete" button on a task
7. **Logout**: Click "Logout" button in the top right

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- User-specific task isolation
- CSRF protection via sessions
- Input validation and sanitization
- XSS prevention (HTML escaping)

## Development

- **Auto-reload**: Run `npm run dev` for development with Nodemon
- **Database Reset**: Delete your MongoDB collection to start fresh
- **Debug**: Check browser console and server logs for errors

## Deployment

### Environment Variables for Production

```
PORT=5000
MONGODB_URI=<your-production-mongodb-url>
SESSION_SECRET=<very-long-random-string>
NODE_ENV=production
```

### Platforms

Compatible with:

- Vercel (with serverless modifications)
- Railway
- Render
- Heroku
- AWS EC2
- DigitalOcean

## License

ISC

## Notes

- Change `SESSION_SECRET` in `.env` before deploying to production
- Use environment-specific MongoDB URIs
- Enable HTTPS in production
- Consider adding rate limiting for auth endpoints
- Add email verification for registration (future enhancement)
