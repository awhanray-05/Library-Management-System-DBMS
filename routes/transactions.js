const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Issue a book
router.post('/issue', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { memberId, bookId, dueDate } = req.body;

        if (!memberId || !bookId) {
            return res.status(400).json({
                success: false,
                message: 'Member ID and Book ID are required'
            });
        }

        // Check if member exists and is active
        const memberQuery = 'SELECT member_id, status FROM members WHERE member_id = :memberId';
        const memberResult = await db.executeQuery(memberQuery, { memberId: parseInt(memberId) });

        if (memberResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        if (memberResult.rows[0].STATUS !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Member account is not active'
            });
        }

        // Check if book exists and is available
        const bookQuery = 'SELECT book_id, available_copies, status FROM books WHERE book_id = :bookId';
        const bookResult = await db.executeQuery(bookQuery, { bookId: parseInt(bookId) });

        if (bookResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }

        if (bookResult.rows[0].AVAILABLE_COPIES <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Book is not available'
            });
        }

        if (bookResult.rows[0].STATUS !== 'AVAILABLE') {
            return res.status(400).json({
                success: false,
                message: 'Book is not available for borrowing'
            });
        }

        // Check if member already has this book borrowed
        const existingBorrowQuery = `
            SELECT transaction_id FROM transactions 
            WHERE member_id = :memberId AND book_id = :bookId AND status = 'BORROWED'
        `;
        const existingBorrow = await db.executeQuery(existingBorrowQuery, { 
            memberId: parseInt(memberId), 
            bookId: parseInt(bookId) 
        });

        if (existingBorrow.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Member already has this book borrowed'
            });
        }

        // Calculate due date (default 14 days from now)
        const calculatedDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        // Start transaction
        const connection = await db.getConnection();
        await connection.execute('BEGIN');

        try {
            // Insert transaction record
            const insertTransactionQuery = `
                INSERT INTO transactions (member_id, book_id, due_date, created_by)
                VALUES (:memberId, :bookId, :dueDate, :createdBy)
                RETURNING transaction_id INTO :transactionId
            `;

            const transactionResult = await connection.execute(insertTransactionQuery, {
                memberId: parseInt(memberId),
                bookId: parseInt(bookId),
                dueDate: calculatedDueDate,
                createdBy: req.user.username,
                transactionId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            });

            // Update book availability
            const updateBookQuery = `
                UPDATE books 
                SET available_copies = available_copies - 1
                WHERE book_id = :bookId
            `;
            await connection.execute(updateBookQuery, { bookId: parseInt(bookId) });

            await connection.execute('COMMIT');

            res.status(201).json({
                success: true,
                message: 'Book issued successfully',
                data: {
                    transactionId: transactionResult.outBinds.transactionId[0],
                    dueDate: calculatedDueDate
                }
            });

        } catch (error) {
            await connection.execute('ROLLBACK');
            throw error;
        } finally {
            await connection.close();
        }

    } catch (error) {
        console.error('Issue book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to issue book',
            error: error.message
        });
    }
});

// Return a book
router.post('/return', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { transactionId } = req.body;

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required'
            });
        }

        // Check if transaction exists and is active
        const transactionQuery = `
            SELECT t.transaction_id, t.member_id, t.book_id, t.issue_date, t.due_date, t.status,
                   b.title, b.author
            FROM transactions t
            JOIN books b ON t.book_id = b.book_id
            WHERE t.transaction_id = :transactionId
        `;
        const transactionResult = await db.executeQuery(transactionQuery, { transactionId: parseInt(transactionId) });

        if (transactionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        const transaction = transactionResult.rows[0];

        if (transaction.STATUS !== 'BORROWED') {
            return res.status(400).json({
                success: false,
                message: 'Book is not currently borrowed'
            });
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.execute('BEGIN');

        try {
            // Update transaction status
            const updateTransactionQuery = `
                UPDATE transactions 
                SET return_date = SYSDATE, status = 'RETURNED'
                WHERE transaction_id = :transactionId
            `;
            await connection.execute(updateTransactionQuery, { transactionId: parseInt(transactionId) });

            // Update book availability
            const updateBookQuery = `
                UPDATE books 
                SET available_copies = available_copies + 1
                WHERE book_id = :bookId
            `;
            await connection.execute(updateBookQuery, { bookId: transaction.BOOK_ID });

            // Calculate fine if overdue
            const isOverdue = new Date(transaction.DUE_DATE) < new Date();
            let fineAmount = 0;

            if (isOverdue) {
                const daysOverdue = Math.ceil((new Date() - new Date(transaction.DUE_DATE)) / (1000 * 60 * 60 * 24));
                fineAmount = daysOverdue * 1.00; // $1 per day

                // Insert fine record
                const insertFineQuery = `
                    INSERT INTO fines (member_id, transaction_id, fine_amount, reason)
                    VALUES (:memberId, :transactionId, :fineAmount, :reason)
                `;
                await connection.execute(insertFineQuery, {
                    memberId: transaction.MEMBER_ID,
                    transactionId: parseInt(transactionId),
                    fineAmount: fineAmount,
                    reason: `Overdue fine for ${daysOverdue} days`
                });
            }

            await connection.execute('COMMIT');

            res.json({
                success: true,
                message: 'Book returned successfully',
                data: {
                    fineAmount: fineAmount,
                    isOverdue: isOverdue
                }
            });

        } catch (error) {
            await connection.execute('ROLLBACK');
            throw error;
        } finally {
            await connection.close();
        }

    } catch (error) {
        console.error('Return book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to return book',
            error: error.message
        });
    }
});

// Get all transactions (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status = '', 
            memberId = '', 
            bookId = '',
            fromDate = '',
            toDate = ''
        } = req.query;
        
        const offset = (page - 1) * limit;
        let whereClause = '';
        let binds = { offset: parseInt(offset), limit: parseInt(limit) };

        if (status) {
            whereClause += ` AND t.status = :status`;
            binds.status = status;
        }

        if (memberId) {
            whereClause += ` AND t.member_id = :memberId`;
            binds.memberId = parseInt(memberId);
        }

        if (bookId) {
            whereClause += ` AND t.book_id = :bookId`;
            binds.bookId = parseInt(bookId);
        }

        if (fromDate) {
            whereClause += ` AND t.issue_date >= TO_DATE(:fromDate, 'YYYY-MM-DD')`;
            binds.fromDate = fromDate;
        }

        if (toDate) {
            whereClause += ` AND t.issue_date <= TO_DATE(:toDate, 'YYYY-MM-DD')`;
            binds.toDate = toDate;
        }

        const query = `
            SELECT t.transaction_id, t.issue_date, t.due_date, t.return_date, t.status,
                   m.member_id, m.first_name || ' ' || m.last_name as member_name, m.email,
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
            JOIN members m ON t.member_id = m.member_id
            JOIN books b ON t.book_id = b.book_id
            WHERE 1=1 ${whereClause}
            ORDER BY t.issue_date DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM transactions t
            WHERE 1=1 ${whereClause}
        `;

        const [transactionsResult, countResult] = await Promise.all([
            db.executeQuery(query, binds),
            db.executeQuery(countQuery, binds)
        ]);

        res.json({
            success: true,
            data: transactionsResult.rows,
            pagination: {
                total: countResult.rows[0].TOTAL,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].TOTAL / limit)
            }
        });

    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions',
            error: error.message
        });
    }
});

// Get transaction by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;

        const query = `
            SELECT t.transaction_id, t.issue_date, t.due_date, t.return_date, t.status,
                   m.member_id, m.first_name || ' ' || m.last_name as member_name, m.email,
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
            JOIN members m ON t.member_id = m.member_id
            JOIN books b ON t.book_id = b.book_id
            WHERE t.transaction_id = :id
        `;

        const result = await db.executeQuery(query, { id: parseInt(id) });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        const transaction = result.rows[0];

        // Members can only view their own transactions
        if (role === 'MEMBER' && transaction.MEMBER_ID !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: transaction
        });

    } catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction',
            error: error.message
        });
    }
});

// Get overdue books
router.get('/overdue/list', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const query = `
            SELECT t.transaction_id, t.issue_date, t.due_date,
                   m.member_id, m.first_name || ' ' || m.last_name as member_name, m.email, m.phone,
                   b.book_id, b.title, b.author, b.isbn,
                   ROUND(SYSDATE - t.due_date) as days_overdue,
                   ROUND(SYSDATE - t.due_date) * 1.00 as fine_amount
            FROM transactions t
            JOIN members m ON t.member_id = m.member_id
            JOIN books b ON t.book_id = b.book_id
            WHERE t.status = 'BORROWED' AND t.due_date < SYSDATE
            ORDER BY t.due_date ASC
        `;

        const result = await db.executeQuery(query);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Get overdue books error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch overdue books',
            error: error.message
        });
    }
});

module.exports = router;
