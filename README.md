# Library Management System

A comprehensive Library Management System built with Node.js, Oracle SQL, and HTML/CSS/JavaScript. This system provides complete library management functionality including book management, member management, transaction handling, and fine management.

## Features

### 🔐 Authentication System
- **Admin/Librarian Login**: Secure authentication for library staff
- **Member Registration & Login**: Self-service member portal
- **Role-based Access Control**: Different permissions for admins and members

### 📚 Book Management
- **Search Books**: Advanced search by title, author, ISBN, category
- **Add/Edit/Delete Books**: Complete book catalog management
- **Book Availability**: Real-time availability tracking
- **Category & Author Management**: Organized book classification

### 👥 Member Management
- **Member Registration**: Self-registration with validation
- **Member Profiles**: Complete member information management
- **Membership Types**: Regular, Premium, and Student memberships
- **Member Status**: Active, Inactive, and Suspended status tracking

### 📖 Transaction Management
- **Issue Books**: Book borrowing with due date tracking
- **Return Books**: Book return with automatic fine calculation
- **Transaction History**: Complete borrowing history
- **Overdue Tracking**: Automatic overdue detection and fine calculation

### 💰 Fine Management
- **Automatic Fine Calculation**: $1 per day for overdue books
- **Fine Status Tracking**: Pending, Paid, and Waived status
- **Fine Reports**: Comprehensive fine reporting

### 📊 Admin Dashboard
- **Statistics Overview**: Key metrics and KPIs
- **Recent Activity**: Latest transactions and activities
- **Top Books**: Most popular books
- **Overdue Reports**: Books that need attention

### 👤 Member Portal
- **Personal Dashboard**: Member-specific information
- **Borrowed Books**: Current and historical book borrowing
- **Fine Tracking**: Personal fine management
- **Profile Management**: Update personal information

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: Oracle SQL
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Authentication**: JWT (JSON Web Tokens)
- **Styling**: Custom CSS with responsive design
- **Icons**: Font Awesome

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Oracle Database (11g or higher)
- Oracle Instant Client

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Library-Management-System-DBMS
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup
1. Create an Oracle database instance
2. Run the SQL script to create tables and initial data:
```sql
-- Run the database/schema.sql file in your Oracle database
```

### 4. Environment Configuration
Create a `config.env` file in the root directory:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=1521
DB_SERVICE_NAME=XE
DB_USER=library_admin
DB_PASSWORD=library123
DB_CONNECTION_STRING=localhost:1521/XE

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 5. Start the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 6. Access the Application
- **Main Application**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin.html
- **Member Portal**: http://localhost:3000/member.html

## Default Login Credentials

### Admin Account
- **Username**: admin
- **Password**: admin123
- **Role**: Administrator

### Test Member Account
- Register a new member through the registration form
- Or use the member registration API

## API Endpoints

### Authentication
- `POST /api/auth/admin-login` - Admin login
- `POST /api/auth/member-login` - Member login
- `POST /api/auth/member-register` - Member registration
- `GET /api/auth/me` - Get current user info

### Books
- `GET /api/books` - Get all books (with search/filter)
- `GET /api/books/:id` - Get book by ID
- `POST /api/books` - Create new book (Admin only)
- `PUT /api/books/:id` - Update book (Admin only)
- `DELETE /api/books/:id` - Delete book (Admin only)

### Members
- `GET /api/members` - Get all members (Admin only)
- `GET /api/members/:id` - Get member by ID
- `POST /api/members` - Create new member (Admin only)
- `PUT /api/members/:id` - Update member
- `DELETE /api/members/:id` - Delete member (Admin only)

### Transactions
- `POST /api/transactions/issue` - Issue a book (Admin only)
- `POST /api/transactions/return` - Return a book (Admin only)
- `GET /api/transactions` - Get all transactions (Admin only)
- `GET /api/transactions/:id` - Get transaction by ID

### Admin
- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/fines` - Get all fines (Admin only)
- `PUT /api/admin/fines/:id` - Update fine status (Admin only)

## Project Structure

```
Library-Management-System-DBMS/
├── config/
│   └── database.js          # Database connection configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── books.js             # Book management routes
│   ├── members.js           # Member management routes
│   ├── transactions.js      # Transaction routes
│   └── admin.js             # Admin-specific routes
├── database/
│   └── schema.sql            # Database schema and initial data
├── public/
│   ├── css/
│   │   ├── style.css        # Main stylesheet
│   │   ├── admin.css        # Admin dashboard styles
│   │   └── member.css       # Member portal styles
│   ├── js/
│   │   ├── app.js           # Main application JavaScript
│   │   ├── admin.js         # Admin dashboard functionality
│   │   └── member.js        # Member portal functionality
│   ├── index.html           # Main landing page
│   ├── admin.html           # Admin dashboard
│   └── member.html          # Member portal
├── server.js                # Main server file
├── package.json             # Node.js dependencies
└── config.env               # Environment configuration
```

## Key Features Implementation

### 🔍 Advanced Search
- Search books by title, author, ISBN
- Filter by category, author, availability
- Real-time search results

### 📱 Responsive Design
- Mobile-first approach
- Responsive navigation
- Touch-friendly interface

### 🔒 Security Features
- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization

### 📊 Real-time Updates
- Live dashboard statistics
- Real-time book availability
- Automatic fine calculations

## Database Schema

The system uses the following main tables:
- **members**: Member information and authentication
- **books**: Book catalog and availability
- **transactions**: Book borrowing and returning
- **fines**: Fine tracking and management
- **librarians**: Admin user management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.

---

**Note**: This is a comprehensive library management system designed for educational purposes and can be extended for production use with additional security measures and testing.