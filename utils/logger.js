const AuditLog = require('../models/AuditLog');

const logAction = async ({ user, action, resource, details, req }) => {
    try {
        await AuditLog.create({
            user: user?._id || null,
            action,
            resource,
            details,
            ip: req?.ip || req?.headers['x-forwarded-for'] || 'unknown'
        });
    } catch (error) {
        console.error('Audit Log Error:', error);
    }
};

module.exports = { logAction };
