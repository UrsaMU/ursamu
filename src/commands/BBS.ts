import { addCmd, bboard, dbojs, flags, send } from "../services/index.ts";
import { formatString, getNextId } from "../utils/index.ts";

export default () => {
  // Board Management Commands
  // 1. Creation and Deletion
  // CreateBoard: Establish a new board.
  // Syntax: +createboard <board name>=<description>

  addCmd({
    name: "board/create",
    category: "Bulletin Boards",
    pattern: /^[+@]?bboard\/create\s+(.*)(?:\s*=\s*(.*))?/i,
    lock: "connected admin+",
    exec: async ({ socket }, [name, desc]) => {
      const en = await dbojs.findOne({ id: socket.cid });
      if (!en) return;

      const id = await getNextId("boardId");
      if (!id) return send([socket.id], "%chGAME>%cn No board ID generated.");

      const taken = await bboard.findOne({ name });
      if (taken) {
        return send(
          [socket.id],
          "%chGAME>%cn That board name is already taken."
        );
      }

      await bboard.insert({
        name,
        description: desc || "",
        category: "General",
        posts: [],
        boardId: id,
      });

      send(
        [socket.id],
        `%chGAME>%cn Board %ch${name.toUpperCase()}%cn created.`
      );
    },
  });

  // DeleteBoard: Remove an existing board.
  // Syntax: +deleteboard <board name>
  addCmd({
    name: "board/delete",
    category: "Bulletin Boards",
    pattern: /^[+@]?bboard\/delete\s+(.*)/i,
    lock: "connected admin+",
    exec: async ({ socket }, [name]) => {
      const en = await dbojs.findOne({ id: socket.cid });
      if (!en) return;

      const tar = await bboard.findOne({ $or: [{ name }, { boardId: +name }] });
      if (!tar) {
        return send([socket.id], "%chGAME>%cn Board not found.");
      }

      await bboard.remove({ boardId: tar.boardId });
      send(
        [socket.id],
        `%chGAME>%cn Board %ch${tar.name.toUpperCase()}%cn deleted.`
      );
    },
  });
  // 2. Modification
  // RenameBoard: Change the name of a board.
  // Syntax: +renameboard <old name>=<new name>
  addCmd({
    name: "board/name",
    category: "Bulletin Boards",
    pattern: /^[+@]?bboard\/name\s+(.*)=(.*)/i,
    lock: "connected admin+",
    exec: async ({ socket }, [oldName, newName]) => {
      const en = await dbojs.findOne({ id: socket.cid });
      if (!en) return;

      const tar = await bboard.findOne({
        $or: [{ name: oldName }, { boardId: +oldName }],
      });

      if (!tar) {
        return send([socket.id], "%chGAME>%cn Board not found.");
      }

      await bboard.update({ name: tar.name }, { $set: { name: newName } });
      send(
        [socket.id],
        `%chGAME>%cn Board %ch${tar.name.toUpperCase()}%cn renamed to %ch${newName.toUpperCase()}%cn.`
      );
    },
  });
  // BoardDesc: Change the description of a board.
  // Syntax: +boarddesc <board name>=<new description>
  addCmd({
    name: "board/desc",
    category: "Bulletin Boards",
    pattern: /^[+@]?bboard\/desc\s+(.*)=(.*)/i,
    lock: "connected admin+",
    exec: async ({ socket }, [name, desc]) => {
      const en = await dbojs.findOne({ id: socket.cid });
      if (!en) return;

      const tar = await bboard.findOne({ $or: [{ name }, { boardId: +name }] });
      if (!tar) {
        return send([socket.id], "%chGAME>%cn Board not found.");
      }

      await bboard.update({ name: tar.name }, { $set: { description: desc } });
      send(
        [socket.id],
        `%chGAME>%cn Board %ch${tar.name.toUpperCase()}%cn description updated.`
      );
    },
  });
  // 3. Permissions
  // Permissions: Set who can read or write to a board.
  // Syntax: +permissions <board name>=<read access>/<write access>
  // Moderators: Assign or remove moderators to/from a board.
  // Syntax: +moderators <board name>=<user list>
  // 4. View and Search
  // ListBoards: View all boards or boards in a category.
  // Syntax: +listboards [category]
  /**
   * ==============================================================================
   *           Board Name                    Last Post                  # of Posts
   * ==============================================================================
   *  1    (-) General                       2019-01-01 12:00                    5
   *  2    (-) Announcements                 2019-01-01 12:00                   20
   *  3     *  Staff                         2019-01-01 12:00                    0
   * ==============================================================================
   * '*' = restricted     '-' = Read Only     '(-)' - Read Only, but you can write
   * ==============================================================================
   */
  addCmd({
    name: "bbread",
    category: "Bulletin Boards",
    pattern: /^[+@]?bbread/i,
    lock: "connected",
    exec: async ({ socket }) => {
      const en = await dbojs.findOne({ id: socket.cid });
      if (!en) return;

      const boards = await bboard.findAll();

      if (!boards.length) {
        return send([socket.id], "%chGAME>%cn No boards found.");
      }

      let output = `%ch%cb==============================================================================%cn\n`;
      output += `           Board Name                    Last Post                 # of Posts\n`;
      output += `%ch%cb==============================================================================%cn\n`;

      boards
        .sort((a, b) => a.boardId - b.boardId)
        .forEach((b) => {
          let read = true;
          let write = true;
          let access = "   ";

          if (b.read) {
            read = flags.check(en.flags, b.read);
          }

          if (b.write) {
            write = flags.check(en.flags, b.write);
          }

          // if the user doesn't have read, skip.
          if (!read) return;

          // if restritcted, mark access as *.
          if (read && b.read) access = " * ";

          // if read only, mark access as -.
          if (!write) access = " - ";

          // if read only but user can write, mark access as (-).
          if (write && b.write) access = "(-)";

          output += ` ${b.boardId
            ?.toString()
            .padEnd(5)} ${access} ${formatString(b.name, 29)} ${(
            b.lastPost?.toDateString() || "None"
          ).padEnd(34)} ${b.posts?.length || 0}\n`;
        });

      output += `%ch%cb==============================================================================%cn\n`;
      output += `'*' = restricted     '-' = Read Only     '(-)' - Read Only, but you can write\n`;
      output += `%ch%cb==============================================================================%cn\n`;
      send([socket.id], output);
    },
  });
  // SearchBoards: Find boards based on keywords.
  // Syntax: +searchboards <keyword>
  // 5. Categorization

  // POSTS
  // 1. Reading and Navigation
  // Read: Allow users to read posts on the bulletin board.
  // Syntax: +read <board>/<message number>
  // Next/Prev: Navigate through messages.
  // Syntax: +next, +prev
  // Scan: Show a list of boards or messages.
  // Syntax: +scan, +scan <board>
  // Catchup: Mark all messages as read.
  // Syntax: +catchup <board>
  // 2. Posting and Responding
  // Post: Create a new post on a board.
  // Syntax: +post <board>=<subject>/<message>
  // Reply: Respond to an existing post.
  // Syntax: +reply <board>/<message number>=<message>
  // Edit: Modify an existing post or reply.
  // Syntax: +edit <board>/<message number>=<new message>
  // 3. Management
  // Delete: Remove a post or thread.
  // Syntax: +delete <board>/<message number>
  // Move: Transfer a post or thread to another board.
  // Syntax: +move <board>/<message number>=<new board>
  // Lock/Unlock: Prevent further replies to a post or thread.
  // Syntax: +lock <board>/<message number>, +unlock <board>/<message number>
  // 4. Miscellaneous
  // Search: Find posts by keyword or author.
  // Syntax: +search <board>=<keyword>
  // Subscribe/Unsubscribe: Choose which boards to receive notifications from.
  // Syntax: +subscribe <board>, +unsubscribe <board>
  // Help: Provide usage information and command syntax.
  // Syntax: +help [command]
  // 5. Administration
  // CreateBoard: Establish a new board.
  // Syntax: +createboard <board name>=<description>
  // DeleteBoard: Remove an existing board.
  // Syntax: +deleteboard <board name>
  // RenameBoard: Change the name of a board.
  // Syntax: +renameboard <old name>=<new name>
  // BoardDesc: Change the description of a board.
  // Syntax: +boarddesc <board name>=<new description>
  // Permissions: Set who can read or write to a board.
  // Syntax: +permissions <board name>=<read access>/<write access>
  // 6. User Preferences
  // Alias: Set an alias for posting anonymously or under a different name.
  // Syntax: +alias <alias name>
  // Profile: Set or view user profiles, which might be displayed in posts.
  // Syntax: +profile [user]
  // Settings: Configure user-specific settings, like notifications.
  // Syntax: +settings <option>=<value>
  // Implementation Tips:
  // Data Storage: Consider how you'll store data. A database might be suitable for storing posts, user profiles, and board information.
  // Accessibility: Ensure that your commands are intuitive and your help files are comprehensive to assist new users in navigating the BBS.
  // Notifications: Implement notifications to inform users about new posts or replies on the boards they're subscribed to.
  // Validation: Ensure that user inputs are validated for security and functionality.
  // Role-Based Access: Implement role-based access control to allow only authorized users to perform administrative actions.
  // Logging: Maintain logs of user activity and changes for auditability and to troubleshoot issues.
  // Testing: Ensure thorough testing of commands and functionalities to provide a smooth user experience.
};
