const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access token required' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'library_secret_key');
        
        // Verify user still exists in database
        const userQuery = `
            SELECT user_id, username, role, status 
            FROM (
                SELECT librarian_id as user_id, username, role, status, 'librarian' as user_type
                FROM librarians
                WHERE librarian_id = :userId
                UNION ALL
                SELECT member_id as user_id, email as username, 'MEMBER' as role, status, 'member' as user_type
                FROM members
                WHERE member_id = :userId
            )
        `;
        
        const result = await db.executeQuery(userQuery, { userId: decoded.userId });
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const user = result.rows[0];
        if (user.STATUS !== 'ACTIVE') {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is inactive' 
            });
        }

        req.user = {
            userId: user.USER_ID,
            username: user.USERNAME,
            role: user.ROLE,
            userType: user.USER_TYPE
        };
        
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid or expired token' 
        });
    }
};

// Middleware to check if user is admin/librarian
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN' && req.user.role !== 'LIBRARIAN') {
        return res.status(403).json({ 
            success: false, 
            message: 'Admin access required' 
        });
    }
    next();
};

// Middleware to check if user is admin only
const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ 
            success: false, 
            message: 'Super admin access required' 
        });
    }
    next();
};

// Middleware to check if user is member
const requireMember = (req, res, next) => {
    if (req.user.role !== 'MEMBER') {
        return res.status(403).json({ 
            success: false, 
            message: 'Member access required' 
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireSuperAdmin,
    requireMember
};
