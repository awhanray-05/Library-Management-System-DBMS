const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all members (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = '';
        let binds = { offset: parseInt(offset), limit: parseInt(limit) };

        if (search) {
            whereClause += ` AND (LOWER(first_name) LIKE LOWER(:search) OR LOWER(last_name) LIKE LOWER(:search) OR LOWER(email) LIKE LOWER(:search))`;
            binds.search = `%${search}%`;
        }

        if (status) {
            whereClause += ` AND status = :status`;
            binds.status = status;
        }

        const query = `
            SELECT member_id, first_name, last_name, email, phone, address,
                   membership_type, join_date, status,
                   (SELECT COUNT(*) FROM transactions WHERE member_id = m.member_id AND status = 'BORROWED') as borrowed_books
            FROM members m
            WHERE 1=1 ${whereClause}
            ORDER BY join_date DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM members
            WHERE 1=1 ${whereClause}
        `;

        const [membersResult, countResult] = await Promise.all([
            db.executeQuery(query, binds),
            db.executeQuery(countQuery, binds)
        ]);

        res.json({
            success: true,
            data: membersResult.rows,
            pagination: {
                total: countResult.rows[0].TOTAL,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].TOTAL / limit)
            }
        });

    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members',
            error: error.message
        });
    }
});

// Get member by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;

        // Members can only view their own data, admins can view any
        if (role === 'MEMBER' && parseInt(id) !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const query = `
            SELECT m.member_id, m.first_name, m.last_name, m.email, m.phone, m.address,
                   m.membership_type, m.join_date, m.status,
                   (SELECT COUNT(*) FROM transactions WHERE member_id = m.member_id AND status = 'BORROWED') as borrowed_books,
                   (SELECT COUNT(*) FROM transactions WHERE member_id = m.member_id) as total_transactions
            FROM members m
            WHERE m.member_id = :id
        `;

        const result = await db.executeQuery(query, { id: parseInt(id) });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member',
            error: error.message
        });
    }
});

// Create new member (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, address, membershipType, password } = req.body;

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
            message: 'Member created successfully',
            data: { memberId: result.outBinds.memberId[0] }
        });

    } catch (error) {
        console.error('Create member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create member',
            error: error.message
        });
    }
});

// Update member
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;
        const { firstName, lastName, email, phone, address, membershipType, status } = req.body;

        // Members can only update their own data, admins can update any
        if (role === 'MEMBER' && parseInt(id) !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if member exists
        const checkQuery = 'SELECT member_id FROM members WHERE member_id = :id';
        const memberCheck = await db.executeQuery(checkQuery, { id: parseInt(id) });

        if (memberCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        // Check if email is being changed and if it already exists
        if (email) {
            const emailCheckQuery = 'SELECT member_id FROM members WHERE email = :email AND member_id != :id';
            const emailCheck = await db.executeQuery(emailCheckQuery, { email, id: parseInt(id) });

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
        }

        const updateQuery = `
            UPDATE members 
            SET first_name = COALESCE(:firstName, first_name),
                last_name = COALESCE(:lastName, last_name),
                email = COALESCE(:email, email),
                phone = COALESCE(:phone, phone),
                address = COALESCE(:address, address),
                membership_type = COALESCE(:membershipType, membership_type),
                status = COALESCE(:status, status)
            WHERE member_id = :id
        `;

        await db.executeQuery(updateQuery, {
            id: parseInt(id),
            firstName: firstName || null,
            lastName: lastName || null,
            email: email || null,
            phone: phone || null,
            address: address || null,
            membershipType: membershipType || null,
            status: status || null
        });

        res.json({
            success: true,
            message: 'Member updated successfully'
        });

    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update member',
            error: error.message
        });
    }
});

// Delete member (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if member has active transactions
        const activeTransactionsQuery = `
            SELECT COUNT(*) as count 
            FROM transactions 
            WHERE member_id = :id AND status = 'BORROWED'
        `;
        const activeCheck = await db.executeQuery(activeTransactionsQuery, { id: parseInt(id) });

        if (activeCheck.rows[0].COUNT > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete member with active book borrowings'
            });
        }

        // Soft delete by setting status to INACTIVE
        const deleteQuery = 'UPDATE members SET status = \'INACTIVE\' WHERE member_id = :id';
        const result = await db.executeQuery(deleteQuery, { id: parseInt(id) });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            message: 'Member deleted successfully'
        });

    } catch (error) {
        console.error('Delete member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete member',
            error: error.message
        });
    }
});

// Get member's borrowed books
router.get('/:id/borrowed-books', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;

        // Members can only view their own data, admins can view any
        if (role === 'MEMBER' && parseInt(id) !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const query = `
            SELECT t.transaction_id, t.issue_date, t.due_date, t.status,
                   b.book_id, b.title, b.author, b.isbn,
                   CASE 
                       WHEN t.due_date < SYSDATE AND t.status = 'BORROWED' THEN 'OVERDUE'
                       ELSE t.status
                   END as current_status,
                   CASE 
                       WHEN t.due_date < SYSDATE AND t.status = 'BORROWED' 
                       THEN ROUND(SYSDATE - t.due_date) * 1.00
                       ELSE 0
                   END as fine_amount
            FROM transactions t
            JOIN books b ON t.book_id = b.book_id
            WHERE t.member_id = :id
            ORDER BY t.issue_date DESC
        `;

        const result = await db.executeQuery(query, { id: parseInt(id) });

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get borrowed books error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch borrowed books',
            error: error.message
        });
    }
});

// Get member's fines
router.get('/:id/fines', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;

        // Members can only view their own data, admins can view any
        if (role === 'MEMBER' && parseInt(id) !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const query = `
            SELECT f.fine_id, f.fine_amount, f.fine_date, f.paid_date, f.status, f.reason,
                   t.transaction_id, t.issue_date, t.due_date,
                   b.title, b.author
            FROM fines f
            JOIN transactions t ON f.transaction_id = t.transaction_id
            JOIN books b ON t.book_id = b.book_id
            WHERE f.member_id = :id
            ORDER BY f.fine_date DESC
        `;

        const result = await db.executeQuery(query, { id: parseInt(id) });

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get fines error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch fines',
            error: error.message
        });
    }
});

module.exports = router;
