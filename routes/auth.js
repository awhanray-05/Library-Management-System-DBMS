const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Admin/Librarian login
router.post('/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const query = `
            SELECT librarian_id, username, first_name, last_name, email, 
                   password_hash, role, status
            FROM librarians 
            WHERE username = :username AND status = 'ACTIVE'
        `;

        const result = await db.executeQuery(query, { username });

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const librarian = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, librarian.PASSWORD_HASH);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            { 
                userId: librarian.LIBRARIAN_ID,
                username: librarian.USERNAME,
                role: librarian.ROLE
            },
            process.env.JWT_SECRET || 'library_secret_key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: librarian.LIBRARIAN_ID,
                username: librarian.USERNAME,
                name: `${librarian.FIRST_NAME} ${librarian.LAST_NAME}`,
                email: librarian.EMAIL,
                role: librarian.ROLE
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Member login
router.post('/member-login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const query = `
            SELECT member_id, first_name, last_name, email, password_hash, 
                   membership_type, status, join_date
            FROM members 
            WHERE email = :email AND status = 'ACTIVE'
        `;

        const result = await db.executeQuery(query, { email });

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const member = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, member.PASSWORD_HASH);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            { 
                userId: member.MEMBER_ID,
                email: member.EMAIL,
                role: 'MEMBER'
            },
            process.env.JWT_SECRET || 'library_secret_key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: member.MEMBER_ID,
                name: `${member.FIRST_NAME} ${member.LAST_NAME}`,
                email: member.EMAIL,
                membershipType: member.MEMBERSHIP_TYPE,
                joinDate: member.JOIN_DATE
            }
        });

    } catch (error) {
        console.error('Member login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Member registration
router.post('/member-register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, address, password, membershipType } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'First name, last name, email, and password are required'
            });
        }

        // Check if email already exists
        const checkEmailQuery = 'SELECT member_id FROM members WHERE email = :email';
        const emailCheck = await db.executeQuery(checkEmailQuery, { email });

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new member
        const insertQuery = `
            INSERT INTO members (first_name, last_name, email, phone, address, 
                                membership_type, password_hash)
            VALUES (:firstName, :lastName, :email, :phone, :address, 
                    :membershipType, :passwordHash)
            RETURNING member_id INTO :memberId
        `;

        const result = await db.executeQuery(insertQuery, {
            firstName,
            lastName,
            email,
            phone: phone || null,
            address: address || null,
            membershipType: membershipType || 'REGULAR',
            passwordHash: hashedPassword,
            memberId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        });

        res.status(201).json({
            success: true,
            message: 'Member registered successfully',
            memberId: result.outBinds.memberId[0]
        });

    } catch (error) {
        console.error('Member registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const { userId, role } = req.user;

        if (role === 'MEMBER') {
            const query = `
                SELECT member_id, first_name, last_name, email, phone, address,
                       membership_type, join_date, status
                FROM members 
                WHERE member_id = :userId
            `;
            const result = await db.executeQuery(query, { userId });
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Member not found'
                });
            }

            const member = result.rows[0];
            res.json({
                success: true,
                user: {
                    id: member.MEMBER_ID,
                    name: `${member.FIRST_NAME} ${member.LAST_NAME}`,
                    email: member.EMAIL,
                    phone: member.PHONE,
                    address: member.ADDRESS,
                    membershipType: member.MEMBERSHIP_TYPE,
                    joinDate: member.JOIN_DATE,
                    status: member.STATUS,
                    role: 'MEMBER'
                }
            });
        } else {
            const query = `
                SELECT librarian_id, username, first_name, last_name, email, role, status
                FROM librarians 
                WHERE librarian_id = :userId
            `;
            const result = await db.executeQuery(query, { userId });
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Librarian not found'
                });
            }

            const librarian = result.rows[0];
            res.json({
                success: true,
                user: {
                    id: librarian.LIBRARIAN_ID,
                    username: librarian.USERNAME,
                    name: `${librarian.FIRST_NAME} ${librarian.LAST_NAME}`,
                    email: librarian.EMAIL,
                    role: librarian.ROLE,
                    status: librarian.STATUS
                }
            });
        }

    } catch (error) {
        console.error('Get user info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user information',
            error: error.message
        });
    }
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;
