const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const queries = {
            totalMembers: 'SELECT COUNT(*) as count FROM members WHERE status = \'ACTIVE\'',
            totalBooks: 'SELECT COUNT(*) as count FROM books',
            availableBooks: 'SELECT COUNT(*) as count FROM books WHERE available_copies > 0',
            borrowedBooks: 'SELECT COUNT(*) as count FROM transactions WHERE status = \'BORROWED\'',
            overdueBooks: `
                SELECT COUNT(*) as count 
                FROM transactions 
                WHERE status = 'BORROWED' AND due_date < SYSDATE
            `,
            totalFines: `
                SELECT COALESCE(SUM(fine_amount), 0) as total 
                FROM fines 
                WHERE status = 'PENDING'
            `,
            recentTransactions: `
                SELECT t.transaction_id, t.issue_date, t.status,
                       m.first_name || ' ' || m.last_name as member_name,
                       b.title, b.author
                FROM transactions t
                JOIN members m ON t.member_id = m.member_id
                JOIN books b ON t.book_id = b.book_id
                ORDER BY t.issue_date DESC
                FETCH FIRST 5 ROWS ONLY
            `,
            topBooks: `
                SELECT b.title, b.author, COUNT(t.transaction_id) as borrow_count
                FROM books b
                JOIN transactions t ON b.book_id = t.book_id
                GROUP BY b.book_id, b.title, b.author
                ORDER BY borrow_count DESC
                FETCH FIRST 5 ROWS ONLY
            `
        };

        const results = {};
        
        for (const [key, query] of Object.entries(queries)) {
            const result = await db.executeQuery(query);
            if (key === 'recentTransactions' || key === 'topBooks') {
                results[key] = result.rows;
            } else {
                results[key] = result.rows[0].COUNT || result.rows[0].TOTAL || 0;
            }
        }

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
});

// Get all librarians (Super Admin only)
router.get('/librarians', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', role = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '';
        let binds = { offset: parseInt(offset), limit: parseInt(limit) };

        if (search) {
            whereClause += ` AND (LOWER(username) LIKE LOWER(:search) OR LOWER(first_name) LIKE LOWER(:search) OR LOWER(last_name) LIKE LOWER(:search) OR LOWER(email) LIKE LOWER(:search))`;
            binds.search = `%${search}%`;
        }

        if (role) {
            whereClause += ` AND role = :role`;
            binds.role = role;
        }

        const query = `
            SELECT librarian_id, username, first_name, last_name, email, role, 
                   created_date, status
            FROM librarians
            WHERE 1=1 ${whereClause}
            ORDER BY created_date DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM librarians
            WHERE 1=1 ${whereClause}
        `;

        const [librariansResult, countResult] = await Promise.all([
            db.executeQuery(query, binds),
            db.executeQuery(countQuery, binds)
        ]);

        res.json({
            success: true,
            data: librariansResult.rows,
            pagination: {
                total: countResult.rows[0].TOTAL,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].TOTAL / limit)
            }
        });

    } catch (error) {
        console.error('Get librarians error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch librarians',
            error: error.message
        });
    }
});

// Create new librarian (Super Admin only)
router.post('/librarians', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { username, firstName, lastName, email, password, role } = req.body;

        if (!username || !firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username, first name, last name, email, and password are required'
            });
        }

        // Check if username already exists
        const usernameCheckQuery = 'SELECT librarian_id FROM librarians WHERE username = :username';
        const usernameCheck = await db.executeQuery(usernameCheckQuery, { username });

        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Check if email already exists
        const emailCheckQuery = 'SELECT librarian_id FROM librarians WHERE email = :email';
        const emailCheck = await db.executeQuery(emailCheckQuery, { email });

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists'
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const insertQuery = `
            INSERT INTO librarians (username, first_name, last_name, email, password_hash, role)
            VALUES (:username, :firstName, :lastName, :email, :passwordHash, :role)
            RETURNING librarian_id INTO :librarianId
        `;

        const result = await db.executeQuery(insertQuery, {
            username,
            firstName,
            lastName,
            email,
            passwordHash: hashedPassword,
            role: role || 'LIBRARIAN',
            librarianId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        });

        res.status(201).json({
            success: true,
            message: 'Librarian created successfully',
            data: { librarianId: result.outBinds.librarianId[0] }
        });

    } catch (error) {
        console.error('Create librarian error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create librarian',
            error: error.message
        });
    }
});

// Update librarian (Super Admin only)
router.put('/librarians/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, firstName, lastName, email, role, status } = req.body;

        // Check if librarian exists
        const checkQuery = 'SELECT librarian_id FROM librarians WHERE librarian_id = :id';
        const librarianCheck = await db.executeQuery(checkQuery, { id: parseInt(id) });

        if (librarianCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Librarian not found'
            });
        }

        // Check if username is being changed and if it already exists
        if (username) {
            const usernameCheckQuery = 'SELECT librarian_id FROM librarians WHERE username = :username AND librarian_id != :id';
            const usernameCheck = await db.executeQuery(usernameCheckQuery, { username, id: parseInt(id) });

            if (usernameCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already in use'
                });
            }
        }

        // Check if email is being changed and if it already exists
        if (email) {
            const emailCheckQuery = 'SELECT librarian_id FROM librarians WHERE email = :email AND librarian_id != :id';
            const emailCheck = await db.executeQuery(emailCheckQuery, { email, id: parseInt(id) });

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
        }

        const updateQuery = `
            UPDATE librarians 
            SET username = COALESCE(:username, username),
                first_name = COALESCE(:firstName, first_name),
                last_name = COALESCE(:lastName, last_name),
                email = COALESCE(:email, email),
                role = COALESCE(:role, role),
                status = COALESCE(:status, status)
            WHERE librarian_id = :id
        `;

        await db.executeQuery(updateQuery, {
            id: parseInt(id),
            username: username || null,
            firstName: firstName || null,
            lastName: lastName || null,
            email: email || null,
            role: role || null,
            status: status || null
        });

        res.json({
            success: true,
            message: 'Librarian updated successfully'
        });

    } catch (error) {
        console.error('Update librarian error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update librarian',
            error: error.message
        });
    }
});

// Delete librarian (Super Admin only)
router.delete('/librarians/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deletion of the last admin
        const adminCountQuery = 'SELECT COUNT(*) as count FROM librarians WHERE role = \'ADMIN\'';
        const adminCount = await db.executeQuery(adminCountQuery);

        if (adminCount.rows[0].COUNT <= 1) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete the last admin user'
            });
        }

        // Prevent self-deletion
        if (parseInt(id) === req.user.userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const deleteQuery = 'DELETE FROM librarians WHERE librarian_id = :id';
        const result = await db.executeQuery(deleteQuery, { id: parseInt(id) });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Librarian not found'
            });
        }

        res.json({
            success: true,
            message: 'Librarian deleted successfully'
        });

    } catch (error) {
        console.error('Delete librarian error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete librarian',
            error: error.message
        });
    }
});

// Get all fines
router.get('/fines', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status = '', memberId = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '';
        let binds = { offset: parseInt(offset), limit: parseInt(limit) };

        if (status) {
            whereClause += ` AND f.status = :status`;
            binds.status = status;
        }

        if (memberId) {
            whereClause += ` AND f.member_id = :memberId`;
            binds.memberId = parseInt(memberId);
        }

        const query = `
            SELECT f.fine_id, f.fine_amount, f.fine_date, f.paid_date, f.status, f.reason,
                   m.member_id, m.first_name || ' ' || m.last_name as member_name, m.email,
                   t.transaction_id, t.issue_date, t.due_date,
                   b.title, b.author
            FROM fines f
            JOIN members m ON f.member_id = m.member_id
            JOIN transactions t ON f.transaction_id = t.transaction_id
            JOIN books b ON t.book_id = b.book_id
            WHERE 1=1 ${whereClause}
            ORDER BY f.fine_date DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM fines f
            WHERE 1=1 ${whereClause}
        `;

        const [finesResult, countResult] = await Promise.all([
            db.executeQuery(query, binds),
            db.executeQuery(countQuery, binds)
        ]);

        res.json({
            success: true,
            data: finesResult.rows,
            pagination: {
                total: countResult.rows[0].TOTAL,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].TOTAL / limit)
            }
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

// Update fine status (mark as paid/waived)
router.put('/fines/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['PAID', 'WAIVED'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status (PAID or WAIVED) is required'
            });
        }

        const updateQuery = `
            UPDATE fines 
            SET status = :status,
                paid_date = CASE WHEN :status = 'PAID' THEN SYSDATE ELSE paid_date END
            WHERE fine_id = :id
        `;

        const result = await db.executeQuery(updateQuery, { 
            id: parseInt(id), 
            status 
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Fine not found'
            });
        }

        res.json({
            success: true,
            message: `Fine marked as ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error('Update fine error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update fine',
            error: error.message
        });
    }
});

module.exports = router;
