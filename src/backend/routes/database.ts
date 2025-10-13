import express from 'express';
import { query, queryOne, queryAll, execute } from '../database/helpers.js';

const router = express.Router();

// Get list of all tables
router.get('/tables', async (_req, res) => {
  try {
    const tables = await queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    res.json(tables);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get table schema
router.get('/tables/:tableName/schema', async (req, res) => {
  try {
    const { tableName } = req.params;
    const schema = await queryAll(`PRAGMA table_info(${tableName})`);
    res.json(schema);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get table data with pagination
router.get('/tables/:tableName/data', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { page = '1', limit = '50', search = '', searchColumn = '' } = req.query;
    
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Build WHERE clause for search
    let whereClause = '';
    let params: any[] = [];
    if (search && searchColumn) {
      whereClause = `WHERE ${searchColumn} LIKE ?`;
      params.push(`%${search}%`);
    }
    
    // Get total count
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`,
      params
    );
    
    // Get paginated data
    const data = await queryAll(
      `SELECT * FROM ${tableName} ${whereClause} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit as string), offset]
    );
    
    res.json({
      data,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / parseInt(limit as string))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a row
router.put('/tables/:tableName/rows', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { where, updates } = req.body;
    
    if (!where || !updates) {
      return res.status(400).json({ error: 'where and updates are required' });
    }
    
    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    
    const whereFields = Object.keys(where);
    const whereClause = whereFields.map(f => `${f} = ?`).join(' AND ');
    const whereValues = whereFields.map(f => where[f]);
    
    await execute(
      `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`,
      [...values, ...whereValues]
    );
    
    res.json({ success: true, message: 'Row updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a row
router.delete('/tables/:tableName/rows', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { where } = req.body;
    
    if (!where) {
      return res.status(400).json({ error: 'where clause is required' });
    }
    
    const whereFields = Object.keys(where);
    const whereClause = whereFields.map(f => `${f} = ?`).join(' AND ');
    const whereValues = whereFields.map(f => where[f]);
    
    await execute(
      `DELETE FROM ${tableName} WHERE ${whereClause}`,
      whereValues
    );
    
    res.json({ success: true, message: 'Row deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Execute custom SQL query (read-only for safety)
router.post('/query', async (req, res) => {
  try {
    const { sql } = req.body;
    
    if (!sql) {
      return res.status(400).json({ error: 'sql query is required' });
    }
    
    // Only allow SELECT queries for safety
    if (!sql.trim().toLowerCase().startsWith('select')) {
      return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }
    
    const result = await queryAll(sql);
    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
