const oracledb = require('oracledb');
require('dotenv').config({ path: '../config.env' });

class Database {
    constructor() {
        this.connection = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            // Set Oracle client configuration
            oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
            oracledb.autoCommit = true;

            // Create connection pool
            await oracledb.createPool({
                user: process.env.DB_USER || 'library_admin',
                password: process.env.DB_PASSWORD || 'library123',
                connectString: process.env.DB_CONNECTION_STRING || 'localhost:1521/XE',
                poolMin: 2,
                poolMax: 10,
                poolIncrement: 1,
                poolTimeout: 60,
                poolPingInterval: 60
            });

            console.log('Oracle connection pool created successfully');
            this.isConnected = true;
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async getConnection() {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }
            return await oracledb.getConnection();
        } catch (error) {
            console.error('Failed to get database connection:', error);
            throw error;
        }
    }

    async executeQuery(sql, binds = [], options = {}) {
        let connection;
        try {
            connection = await this.getConnection();
            const result = await connection.execute(sql, binds, options);
            return result;
        } catch (error) {
            console.error('Query execution failed:', error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    console.error('Error closing connection:', closeError);
                }
            }
        }
    }

    async executeMany(sql, binds, options = {}) {
        let connection;
        try {
            connection = await this.getConnection();
            const result = await connection.executeMany(sql, binds, options);
            return result;
        } catch (error) {
            console.error('Batch execution failed:', error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    console.error('Error closing connection:', closeError);
                }
            }
        }
    }

    async closePool() {
        try {
            await oracledb.getPool().close();
            this.isConnected = false;
            console.log('Database pool closed');
        } catch (error) {
            console.error('Error closing database pool:', error);
        }
    }
}

module.exports = new Database();
