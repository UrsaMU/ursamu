---
layout: layout.vto
description: Learn how to administer an UrsaMU server
nav:
  - text: User Management
    url: "#user-management"
  - text: Server Configuration
    url: "#server-configuration"
  - text: Backup and Restore
    url: "#backup-and-restore"
  - text: Troubleshooting
    url: "#troubleshooting"
  - text: Security
    url: "#security"
  - text: Performance
    url: "#performance"
---

# Admin Guide

This guide covers the administrative aspects of running an UrsaMU server, including user management, configuration, backups, and troubleshooting.

## User Management

### Creating Admin Users

To create an admin user:

1. Connect to your server
2. Create a new user with the `create` command
3. Grant admin privileges with:
   ```
   @power <username>=wizard
   ```

### Managing User Accounts

As an administrator, you can manage user accounts with these commands:

- `@newpassword <user>=<password>` - Reset a user's password
- `@lock <user>=!<user>` - Lock a user out of their account
- `@unlock <user>` - Unlock a user's account
- `@power <user>=<power level>` - Set a user's power level
- `@nuke <user>` - Delete a user account (use with caution)

### User Roles and Permissions

UrsaMU has several built-in power levels:

- **Guest** (1) - Limited access, can only use basic commands
- **Player** (2) - Standard player access
- **Builder** (3) - Can create and modify objects and rooms
- **Wizard** (4) - Full administrative access
- **God** (5) - Owner-level access, can modify system settings

## Server Configuration

### Basic Configuration

The main configuration file is `config.json` in the server root directory. Key settings include:

- `port` - The port the server listens on
- `hostname` - The server hostname
- `database` - Database connection settings
- `logLevel` - Logging verbosity

### Advanced Configuration

Advanced settings can be configured in the `advanced.json` file:

- `maxConnections` - Maximum number of simultaneous connections
- `idleTimeout` - Time in seconds before idle connections are disconnected
- `backupInterval` - Time in seconds between automatic backups
- `allowGuests` - Whether to allow guest connections

## Backup and Restore

### Automatic Backups

UrsaMU performs automatic backups based on the `backupInterval` setting. Backups are stored in the `backups` directory.

### Manual Backups

To perform a manual backup:

1. Connect as an admin
2. Use the `@backup` command

### Restoring from Backup

To restore from a backup:

1. Stop the server
2. Run the restore command:
   ```
   deno task restore <backup-file>
   ```
3. Restart the server

## Troubleshooting

### Common Issues

#### Server Won't Start

- Check if the port is already in use
- Verify database connection settings
- Check for syntax errors in configuration files

#### Database Connection Issues

- Verify database credentials
- Check if the database server is running
- Ensure the database exists and has the correct schema

#### Performance Problems

- Check server load
- Monitor memory usage
- Consider increasing resources or optimizing configuration

### Logs

Server logs are stored in the `logs` directory. The log level can be configured in `config.json`:

- `error` - Only errors
- `warn` - Errors and warnings
- `info` - General information (default)
- `debug` - Detailed debugging information

## Security

### Securing Your Server

- Use HTTPS for web connections
- Set up a firewall to restrict access
- Keep your server software updated
- Use strong passwords for admin accounts

### SSL Configuration

To enable SSL:

1. Obtain SSL certificates
2. Configure SSL in `config.json`:
   ```json
   "ssl": {
     "enabled": true,
     "cert": "/path/to/cert.pem",
     "key": "/path/to/key.pem"
   }
   ```

## Performance

### Optimizing Performance

- Increase `maxConnections` for busy servers
- Adjust database connection pool size
- Enable caching for frequently accessed data
- Consider using a CDN for static assets

### Monitoring

Monitor your server's performance with:

- `@stat` command for real-time statistics
- External monitoring tools
- Database performance monitoring

### Scaling

For larger installations, consider:

- Horizontal scaling with multiple server instances
- Load balancing
- Database sharding
- Caching layers 