import {
  addCmd,
  capString,
  Comment,
  Condition,
  createObj,
  dbojs,
  footer,
  header,
  Job,
  Obj,
  send,
} from "../index.ts";

export default () => {
  addCmd({
    name: "bucket/create",
    pattern: /^[\+@]?bucket\/create\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      const [name, description] = args;

      if (!en) return;
      const isBucket = await await dbojs.query({
        $and: [{ name: name.toLowerCase() }, { flags: /bucket/i }],
      });

      if (isBucket.length > 0) {
        return send(
          [ctx.socket.id],
          "%chGAME>%cn You can't create a bucket with that name.",
        );
      }

      const lock: Condition = {
        $flags: "admin+",
      };

      const bucket = await createObj("bucket", {
        name: name.toLowerCase(),
        description,
        lock,
        createdby: en.id,
      });

      if (!bucket) return send([ctx.socket.id], "Something went wrong.");

      return send(
        [ctx.socket.id],
        `%chGAME>%cn Bucket %ch${capString(bucket.name || "")}%cn created.`,
      );
    },
  });

  addCmd({
    name: "bucket/list",
    pattern: /^[\+@]?bucket\/list/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);

      if (!en) return;
      const buckets = await await dbojs.query({
        $and: [{ flags: /bucket/i }],
      });

      if (!buckets.length) {
        return send(
          [ctx.socket.id],
          "%chGAME>%cn There are no buckets in the database.",
        );
      }

      const bucketList = buckets.map((bucket) => {
        return `%ch${capString(bucket.data?.name || "")}%cn`;
      });

      return send(
        [ctx.socket.id],
        `%chGAME>%cn Buckets: ${bucketList.join(", ")}`,
      );
    },
  });

  addCmd({
    name: "bucket/delete",
    pattern: /^[\+@]?bucket\/delete\s+(.*)/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      const [name] = args;

      if (!en) return;
      const bucket = await await dbojs.queryOne({
        $and: [{ name: name.toLowerCase() }, { flags: /bucket/i }],
      });

      if (!bucket) {
        return send(
          [ctx.socket.id],
          "%chGAME>%cn You can't delete a bucket that doesn't exist.",
        );
      }

      await dbojs.delete(bucket.id);

      return send(
        [ctx.socket.id],
        `%chGAME>%cn Bucket %ch${
          capString(bucket.data?.name || "")
        }%cn deleted.`,
      );
    },
  });

  //   addCmd({
  //     name: "bucket/set",
  //     pattern: /^[\+@]?bucket\/set\s+(.*)\/(.*)\s*=\s*(.*)/i,
  //     lock: "connected admin+",
  //     exec: async (ctx, args) => {
  //       const en = await Obj.get(ctx.socket.cid);
  //       const bucket = await Obj.get(args[0]);
  //       if (!en) return;
  //       if (!bucket) {
  //         return send([ctx.socket.id], "%chGAME>%cn Bucket not found.");
  //       }

  //       const [key, value] = args;

  //       await bucket.set(key, value);

  //       return send(
  //         [ctx.socket.id],
  //         `%chGAME>%cn Bucket %ch${capString(bucket.name || "")}%cn set.`,
  //       );
  //     },
  //   });

  addCmd({
    name: "job/create",
    pattern: /^[\+@]?job\/create\s+(.*)\/(.*)\s*=\s*(.*)/i,
    lock: "connected storyteller+",
    hidden: true,
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      const bucket = await Obj.get(args[0]);
      if (!en) return;
      if (!bucket) {
        return send([ctx.socket.id], "%chGAME>%cn Bucket not found.");
      }

      const name = args[1];
      const comment = args[2];

      const job: Partial<Job> = {
        name,
        bucketId: bucket.id,
        createdAt: Date.now(),
        creatorId: en.id,
        priority: "Medium",
        status: "Open",
        comments: [{
          content: comment,
          createdAt: Date.now(),
          userId: en.id,
          public: true,
        }],
      };

      const jobObj = await createObj("job", job);

      if (!jobObj) return send([ctx.socket.id], "Something went wrong.");

      return send(
        [ctx.socket.id],
        `%chGAME>%cn Job %ch${
          capString(jobObj.data.title || "")
        }(${jobObj.dbref})%cn created.`,
      );
    },
  });

  addCmd({
    name: "job/delete",
    pattern: /^[\+@]?job\/delete\s+(.*)/i,
    lock: "connected storyteller+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      const job = await Obj.get(args[0]);
      if (!en) return;
      if (!job) {
        return send([ctx.socket.id], "%chGAME>%cn Job not found.");
      }

      await dbojs.delete(job.id);

      return send(
        [ctx.socket.id],
        `%chGAME>%cn Job %ch${
          capString(job.data.title || "")
        }(${job.dbref})%cn deleted.`,
      );
    },
  });

  addCmd({
    name: "jobs",
    pattern: /^[\+@]?jobs$/i,
    lock: "connected storyteller+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const jobs = await dbojs.query({ flags: /job/i });

      if (!jobs.length) {
        return send(
          [ctx.socket.id],
          "%chGAME>%cn There are no jobs in the database.",
        );
      }

      // ================================[JOBS]==================================
      //    ID    JOB             Bucket  Status    Due     Priority  Assignee
      // ------------------------------------------------------------------------
      //  * #1    Test Job        Test    Open      1/1/21  Medium    test
      //    #2    Test Job 2      Test    Open      1/1/21  Low       test
      // ========================================================================
      // * - New comment
      // +job <job> - View a job
      let output = header("JOBS") + "\n";
      output +=
        `   ID    JOB             Bucket  Status    Due       Priority  Assignee\n`;
      output += "%cr-%cn".repeat(78) + "\n";

      const formatJobs = jobs.map((job) => {
        // if the name is longer than 15 characters, truncate it with an ellipsis
        const name = (job.data?.name?.length || 0) > 15
          ? job.data?.name?.slice(0, 12) + "..."
          : job.data?.name?.padEnd(15);
        job.data ||= {};
        job.data.name = name;
        return job;
      });

      for (const job of formatJobs) {
        const bucket = await Obj.get(job.data?.bucketId);
        const lastReadTime = en.data.readJobs && en.data.readJobs[job.id] || 0;
        const hasNewComments = job.data?.comments.some((comment: Comment) =>
          comment.createdAt > lastReadTime
        );
        const newCommentIndicator = hasNewComments ? " * " : "   ";
        output += output += `${newCommentIndicator}`;
        output += `#${job.id.toString().padEnd(5)}`;
        output += `${job?.data?.name?.padEnd(15)}`;
        output += ` ${bucket?.data?.name?.padEnd(8)}`;
        output += `${job.data?.status?.padEnd(10)}`;
        output += `${job.data?.due || "00/00/00"}`.padEnd(9);
        output += ` ${job.data?.priority}`.padEnd(10);
        output += ` ${job.data?.assignee || "None"}`.padEnd(10);
        output += "\n";
      }
      output += footer();
      send([ctx.socket.id], output);
    },
  });

  // ==============================[JOBS #123]===============================
  // ID:    #123                        Priority:  Medium
  // Title: Test Job                    Status:    Open
  // Bucket: Test                       Created:   1/1/21
  // Assignee: test                     Due:       1/1/21
  // ------------------------------ COMMENTS --------------------------------
  // 1. 1/21/2024 12:00:00 AM - This is the first comment on the job. It's
  // entered by the creator of the job.
  // ------------------------------------------------------------------------
  // 2. 1/21/2024 12:00:00 AM - This is the second comment on the job.
  // ========================================================================
};
