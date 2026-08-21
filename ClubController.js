const crypto = require("crypto");
const Console = require("./ConsoleUtils");

const { database } = require("./BackendUtils");

function generateClubId() {
  return "CLUB-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function getUserId(req) {
  return req.user?.id;
}

const ClubController = {

  // ============================================
  // CREATE CLUB
  // POST /clubs/create
  // ============================================

  async create(req, res) {
    try {
      const userId = getUserId(req);
      const username = req.user?.username;

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const name = cleanName(req.body?.name);
      const description = cleanName(req.body?.description);

      if (!name) {
        return res.status(400).json({
          error: "club name required"
        });
      }

      if (name.length < 3 || name.length > 20) {
        return res.status(400).json({
          error: "club name must be 3-20 characters"
        });
      }

      if (description.length > 100) {
        return res.status(400).json({
          error: "description too long"
        });
      }

      // Prüfen, ob Spieler bereits Club besitzt
      const existingClub = await database.collections.Clubs.findOne({
        ownerId: userId
      });

      if (existingClub) {
        return res.status(409).json({
          error: "already owns a club",
          club: existingClub
        });
      }

      // Prüfen, ob Name bereits existiert
      const existingName = await database.collections.Clubs.findOne({
        nameLower: name.toLowerCase()
      });

      if (existingName) {
        return res.status(409).json({
          error: "club name already exists"
        });
      }

      const now = new Date();
      const clubId = generateClubId();

      const club = {
        clubId,
        name,
        nameLower: name.toLowerCase(),
        description,

        ownerId: userId,

        members: [
          {
            userId,
            username,
            role: "owner",
            joinedAt: now
          }
        ],

        memberCount: 1,
        maxMembers: 30,

        createdAt: now,
        updatedAt: now
      };

      await database.collections.Clubs.insertOne(club);

      Console.log(
        "Clubs",
        `Club created: ${name} by ${username || userId}`
      );

      return res.status(201).json({
        success: true,
        club
      });

    } catch (err) {
      Console.error("Clubs", "Create error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // SEARCH CLUBS
  // GET /clubs/search?q=
  // ============================================

  async search(req, res) {
    try {
      const q = cleanName(req.query?.q);

      if (!q) {
        return res.status(400).json({
          error: "search query required"
        });
      }

      const clubs = await database.collections.Clubs
        .find({
          nameLower: {
            $regex: q.toLowerCase(),
            $options: "i"
          }
        })
        .project({
          _id: 0,
          clubId: 1,
          name: 1,
          description: 1,
          ownerId: 1,
          memberCount: 1,
          maxMembers: 1
        })
        .limit(25)
        .toArray();

      return res.status(200).json({
        clubs
      });

    } catch (err) {
      Console.error("Clubs", "Search error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // GET CLUB
  // GET /clubs/:clubId
  // ============================================

  async get(req, res) {
    try {
      const clubId = String(req.params.clubId || "");

      const club = await database.collections.Clubs.findOne(
        { clubId },
        { projection: { _id: 0 } }
      );

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      return res.status(200).json({
        club
      });

    } catch (err) {
      Console.error("Clubs", "Get error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // GET MY CLUB
  // GET /clubs/me
  // ============================================

  async mine(req, res) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const club = await database.collections.Clubs.findOne(
        {
          "members.userId": userId
        },
        {
          projection: { _id: 0 }
        }
      );

      return res.status(200).json({
        club: club || null
      });

    } catch (err) {
      Console.error("Clubs", "Mine error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // GET MEMBERS
  // GET /clubs/:clubId/members
  // ============================================

  async members(req, res) {
    try {
      const clubId = String(req.params.clubId || "");

      const club = await database.collections.Clubs.findOne(
        { clubId },
        {
          projection: {
            _id: 0,
            clubId: 1,
            members: 1
          }
        }
      );

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      return res.status(200).json({
        clubId: club.clubId,
        members: club.members || []
      });

    } catch (err) {
      Console.error("Clubs", "Members error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // JOIN CLUB
  // POST /clubs/:clubId/join
  // ============================================

  async join(req, res) {
    try {
      const userId = getUserId(req);
      const username = req.user?.username;
      const clubId = String(req.params.clubId || "");

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const club = await database.collections.Clubs.findOne({
        clubId
      });

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      const alreadyMember = (club.members || []).some(
        member => String(member.userId) === String(userId)
      );

      if (alreadyMember) {
        return res.status(409).json({
          error: "already a member"
        });
      }

      if ((club.memberCount || 0) >= (club.maxMembers || 30)) {
        return res.status(409).json({
          error: "club is full"
        });
      }

      const member = {
        userId,
        username,
        role: "member",
        joinedAt: new Date()
      };

      await database.collections.Clubs.updateOne(
        {
          clubId,
          "members.userId": {
            $ne: userId
          }
        },
        {
          $push: {
            members: member
          },
          $inc: {
            memberCount: 1
          },
          $set: {
            updatedAt: new Date()
          }
        }
      );

      const updated = await database.collections.Clubs.findOne(
        { clubId },
        { projection: { _id: 0 } }
      );

      return res.status(200).json({
        success: true,
        club: updated
      });

    } catch (err) {
      Console.error("Clubs", "Join error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // LEAVE CLUB
  // POST /clubs/:clubId/leave
  // ============================================

  async leave(req, res) {
    try {
      const userId = getUserId(req);
      const clubId = String(req.params.clubId || "");

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const club = await database.collections.Clubs.findOne({
        clubId
      });

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      const member = (club.members || []).find(
        m => String(m.userId) === String(userId)
      );

      if (!member) {
        return res.status(409).json({
          error: "not a member"
        });
      }

      // Owner darf nicht einfach verlassen,
      // solange der Club besteht.
      if (String(club.ownerId) === String(userId)) {
        return res.status(400).json({
          error: "owner must delete club"
        });
      }

      await database.collections.Clubs.updateOne(
        { clubId },
        {
          $pull: {
            members: {
              userId
            }
          },
          $inc: {
            memberCount: -1
          },
          $set: {
            updatedAt: new Date()
          }
        }
      );

      return res.status(200).json({
        success: true
      });

    } catch (err) {
      Console.error("Clubs", "Leave error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // UPDATE CLUB
  // PATCH /clubs/:clubId
  // ============================================

  async update(req, res) {
    try {
      const userId = getUserId(req);
      const clubId = String(req.params.clubId || "");

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const club = await database.collections.Clubs.findOne({
        clubId
      });

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      if (String(club.ownerId) !== String(userId)) {
        return res.status(403).json({
          error: "only owner can edit club"
        });
      }

      const updates = {};

      if (req.body?.name !== undefined) {
        const name = cleanName(req.body.name);

        if (name.length < 3 || name.length > 20) {
          return res.status(400).json({
            error: "club name must be 3-20 characters"
          });
        }

        const duplicate = await database.collections.Clubs.findOne({
          nameLower: name.toLowerCase(),
          clubId: { $ne: clubId }
        });

        if (duplicate) {
          return res.status(409).json({
            error: "club name already exists"
          });
        }

        updates.name = name;
        updates.nameLower = name.toLowerCase();
      }

      if (req.body?.description !== undefined) {
        const description = cleanName(req.body.description);

        if (description.length > 100) {
          return res.status(400).json({
            error: "description too long"
          });
        }

        updates.description = description;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: "nothing to update"
        });
      }

      updates.updatedAt = new Date();

      await database.collections.Clubs.updateOne(
        { clubId },
        { $set: updates }
      );

      const updated = await database.collections.Clubs.findOne(
        { clubId },
        { projection: { _id: 0 } }
      );

      return res.status(200).json({
        success: true,
        club: updated
      });

    } catch (err) {
      Console.error("Clubs", "Update error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  },

  // ============================================
  // DELETE CLUB
  // DELETE /clubs/:clubId
  // ============================================

  async remove(req, res) {
    try {
      const userId = getUserId(req);
      const clubId = String(req.params.clubId || "");

      if (!userId) {
        return res.status(401).json({
          error: "unauthorized"
        });
      }

      const club = await database.collections.Clubs.findOne({
        clubId
      });

      if (!club) {
        return res.status(404).json({
          error: "club not found"
        });
      }

      if (String(club.ownerId) !== String(userId)) {
        return res.status(403).json({
          error: "only owner can delete club"
        });
      }

      await database.collections.Clubs.deleteOne({
        clubId
      });

      Console.log(
        "Clubs",
        `Club deleted: ${club.name}`
      );

      return res.status(200).json({
        success: true
      });

    } catch (err) {
      Console.error("Clubs", "Delete error:", err);

      return res.status(500).json({
        error: "internal error"
      });
    }
  }
};

module.exports = ClubController;
