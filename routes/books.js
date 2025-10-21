const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all books with search and filtering
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            category = '', 
            author = '',
            status = '',
            available = ''
        } = req.query;
        
        const offset = (page - 1) * limit;
        let whereClause = '';
        let binds = { offset: parseInt(offset), limit: parseInt(limit) };

        if (search) {
            whereClause += ` AND (LOWER(title) LIKE LOWER(:search) OR LOWER(author) LIKE LOWER(:search) OR LOWER(isbn) LIKE LOWER(:search))`;
            binds.search = `%${search}%`;
        }

        if (category) {
            whereClause += ` AND LOWER(category) = LOWER(:category)`;
            binds.category = category;
        }

        if (author) {
            whereClause += ` AND LOWER(author) LIKE LOWER(:author)`;
            binds.author = `%${author}%`;
        }

        if (status) {
            whereClause += ` AND status = :status`;
            binds.status = status;
        }

        if (available === 'true') {
            whereClause += ` AND available_copies > 0`;
        }

        const query = `
            SELECT book_id, title, author, isbn, publisher, publication_year,
                   category, total_copies, available_copies, shelf_location, status,
                   added_date,
                   CASE 
                       WHEN available_copies > 0 THEN 'AVAILABLE'
                       ELSE 'NOT_AVAILABLE'
                   END as availability_status
            FROM books
            WHERE 1=1 ${whereClause}
            ORDER BY title
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM books
            WHERE 1=1 ${whereClause}
        `;

        const [booksResult, countResult] = await Promise.all([
            db.executeQuery(query, binds),
            db.executeQuery(countQuery, binds)
        ]);

        res.json({
            success: true,
            data: booksResult.rows,
            pagination: {
                total: countResult.rows[0].TOTAL,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult.rows[0].TOTAL / limit)
            }
        });

    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch books',
            error: error.message
        });
    }
});

// Get book by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT b.book_id, b.title, b.author, b.isbn, b.publisher, b.publication_year,
                   b.category, b.total_copies, b.available_copies, b.shelf_location, 
                   b.status, b.added_date,
                   CASE 
                       WHEN b.available_copies > 0 THEN 'AVAILABLE'
                       ELSE 'NOT_AVAILABLE'
                   END as availability_status,
                   (SELECT COUNT(*) FROM transactions WHERE book_id = b.book_id AND status = 'BORROWED') as borrowed_count
            FROM books b
            WHERE b.book_id = :id
        `;

        const result = await db.executeQuery(query, { id: parseInt(id) });

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch book',
            error: error.message
        });
    }
});

// Create new book (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { 
            title, author, isbn, publisher, publicationYear, 
            category, totalCopies, shelfLocation 
        } = req.body;

        if (!title || !author) {
            return res.status(400).json({
                success: false,
                message: 'Title and author are required'
            });
        }

        // Check if ISBN already exists (if provided)
        if (isbn) {
            const isbnCheckQuery = 'SELECT book_id FROM books WHERE isbn = :isbn';
            const isbnCheck = await db.executeQuery(isbnCheckQuery, { isbn });

            if (isbnCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ISBN already exists'
                });
            }
        }

        const insertQuery = `
            INSERT INTO books (title, author, isbn, publisher, publication_year,
                             category, total_copies, available_copies, shelf_location)
            VALUES (:title, :author, :isbn, :publisher, :publicationYear,
                    :category, :totalCopies, :availableCopies, :shelfLocation)
            RETURNING book_id INTO :bookId
        `;

        const totalCopiesNum = parseInt(totalCopies) || 1;
        const result = await db.executeQuery(insertQuery, {
            title,
            author,
            isbn: isbn || null,
            publisher: publisher || null,
            publicationYear: publicationYear ? parseInt(publicationYear) : null,
            category: category || null,
            totalCopies: totalCopiesNum,
            availableCopies: totalCopiesNum,
            shelfLocation: shelfLocation || null,
            bookId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        });

        res.status(201).json({
            success: true,
            message: 'Book created successfully',
            data: { bookId: result.outBinds.bookId[0] }
        });

    } catch (error) {
        console.error('Create book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create book',
            error: error.message
        });
    }
});

// Update book (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, author, isbn, publisher, publicationYear, 
            category, totalCopies, shelfLocation, status 
        } = req.body;

        // Check if book exists
        const checkQuery = 'SELECT book_id FROM books WHERE book_id = :id';
        const bookCheck = await db.executeQuery(checkQuery, { id: parseInt(id) });

        if (bookCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }

        // Check if ISBN is being changed and if it already exists
        if (isbn) {
            const isbnCheckQuery = 'SELECT book_id FROM books WHERE isbn = :isbn AND book_id != :id';
            const isbnCheck = await db.executeQuery(isbnCheckQuery, { isbn, id: parseInt(id) });

            if (isbnCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ISBN already in use'
                });
            }
        }

        // Get current book data
        const currentBookQuery = 'SELECT total_copies, available_copies FROM books WHERE book_id = :id';
        const currentBook = await db.executeQuery(currentBookQuery, { id: parseInt(id) });
        const currentTotal = currentBook.rows[0].TOTAL_COPIES;
        const currentAvailable = currentBook.rows[0].AVAILABLE_COPIES;

        let newTotalCopies = currentTotal;
        let newAvailableCopies = currentAvailable;

        // If total copies is being updated
        if (totalCopies !== undefined) {
            const newTotal = parseInt(totalCopies);
            const difference = newTotal - currentTotal;
            newTotalCopies = newTotal;
            newAvailableCopies = Math.max(0, currentAvailable + difference);
        }

        const updateQuery = `
            UPDATE books 
            SET title = COALESCE(:title, title),
                author = COALESCE(:author, author),
                isbn = COALESCE(:isbn, isbn),
                publisher = COALESCE(:publisher, publisher),
                publication_year = COALESCE(:publicationYear, publication_year),
                category = COALESCE(:category, category),
                total_copies = :totalCopies,
                available_copies = :availableCopies,
                shelf_location = COALESCE(:shelfLocation, shelf_location),
                status = COALESCE(:status, status)
            WHERE book_id = :id
        `;

        await db.executeQuery(updateQuery, {
            id: parseInt(id),
            title: title || null,
            author: author || null,
            isbn: isbn || null,
            publisher: publisher || null,
            publicationYear: publicationYear ? parseInt(publicationYear) : null,
            category: category || null,
            totalCopies: newTotalCopies,
            availableCopies: newAvailableCopies,
            shelfLocation: shelfLocation || null,
            status: status || null
        });

        res.json({
            success: true,
            message: 'Book updated successfully'
        });

    } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update book',
            error: error.message
        });
    }
});

// Delete book (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if book has active transactions
        const activeTransactionsQuery = `
            SELECT COUNT(*) as count 
            FROM transactions 
            WHERE book_id = :id AND status = 'BORROWED'
        `;
        const activeCheck = await db.executeQuery(activeTransactionsQuery, { id: parseInt(id) });

        if (activeCheck.rows[0].COUNT > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete book with active borrowings'
            });
        }

        const deleteQuery = 'DELETE FROM books WHERE book_id = :id';
        const result = await db.executeQuery(deleteQuery, { id: parseInt(id) });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }

        res.json({
            success: true,
            message: 'Book deleted successfully'
        });

    } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete book',
            error: error.message
        });
    }
});

// Get book categories
router.get('/categories/list', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT category 
            FROM books 
            WHERE category IS NOT NULL 
            ORDER BY category
        `;

        const result = await db.executeQuery(query);

        res.json({
            success: true,
            data: result.rows.map(row => row.CATEGORY)
        });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

// Get book authors
router.get('/authors/list', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT author 
            FROM books 
            ORDER BY author
        `;

        const result = await db.executeQuery(query);

        res.json({
            success: true,
            data: result.rows.map(row => row.AUTHOR)
        });

    } catch (error) {
        console.error('Get authors error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch authors',
            error: error.message
        });
    }
});

module.exports = router;
