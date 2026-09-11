const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req?.headers?.authorization;
    
    if (!authHeader || !authHeader?.startsWith('Bearer ')) {
      return res?.status(401)?.json({ error: 'No token provided' });
    }
    
    const token = authHeader?.substring(7);
    
    // Verify token
    const decoded = jwt?.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, email, role, full_name FROM user_profiles WHERE id = $1',
      [decoded?.userId]
    );
    
    if (result?.rows?.length === 0) {
      console.error(`Auth: User not found for userId=${decoded?.userId}, email=${decoded?.email}, route=${req?.method} ${req?.originalUrl}`);
      return res?.status(401)?.json({ 
        error: 'User not found. Please log out and log back in.',
        code: 'USER_NOT_FOUND'
      });
    }
    
    req.user = result?.rows?.[0];
    next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError') {
      return res?.status(401)?.json({ error: 'Invalid token. Please log out and log back in.', code: 'INVALID_TOKEN' });
    }
    if (error?.name === 'TokenExpiredError') {
      return res?.status(401)?.json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    console.error('Auth middleware error:', error);
    res?.status(500)?.json({ error: 'Authentication failed' });
  }
};

// Check user role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req?.user) {
      return res?.status(401)?.json({ error: 'Authentication required' });
    }
    
    if (!roles?.includes(req?.user?.role)) {
      return res?.status(403)?.json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// Check specific permission
// Permission string format: "category.action" e.g. "pos.processTransactions", "students.viewAccounts"
// Permissions are stored as nested JSON: { pos: { processTransactions: true, ... }, students: { viewAccounts: true, ... } }
const requirePermission = (...permissionPaths) => {
  return async (req, res, next) => {
    try {
      if (!req?.user) {
        return res?.status(401)?.json({ error: 'Authentication required' });
      }
      
      // Admin has all permissions
      if (req?.user?.role === 'admin') {
        return next();
      }
      
      // Check user permissions
      const result = await query(
        `SELECT permissions FROM user_profiles WHERE id = $1`,
        [req?.user?.id]
      );
      
      if (result?.rows?.length === 0) {
        return res?.status(403)?.json({ error: 'User not found' });
      }
      
      const permissions = result?.rows?.[0]?.permissions;
      
      if (!permissions || typeof permissions !== 'object') {
        return res?.status(403)?.json({ error: 'No permissions configured for this user' });
      }
      
      // Check if user has ANY of the required permissions (OR logic)
      const hasPermission = permissionPaths?.some(permPath => {
        const parts = permPath?.split('.');
        if (parts?.length === 2) {
          const [category, action] = parts;
          return permissions?.[category]?.[action] === true;
        }
        // Single-level permission check (category-level)
        if (parts?.length === 1) {
          const category = parts[0];
          const categoryPerms = permissions?.[category];
          // Has permission if any action in the category is true
          return categoryPerms && typeof categoryPerms === 'object' && 
            Object.values(categoryPerms).some(v => v === true);
        }
        return false;
      });
      
      if (!hasPermission) {
        return res?.status(403)?.json({ 
          error: 'You do not have permission to perform this action',
          requiredPermissions: permissionPaths
        });
      }
      
      // Attach permissions to req.user for downstream use
      req.user.permissions = permissions;
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res?.status(500)?.json({ error: 'Permission check failed' });
    }
  };
};

module.exports = {
  verifyToken,
  requireRole,
  requirePermission
};