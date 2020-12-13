const discord = require("discord.js");
const bot = new discord.Client();
const sqlite = require('sqlite3').verbose();
const botConfig = require('./config.json')
var fs = require('fs');


const express = require('express');
const app = express();
const port = 3000;
bot.commands = new discord.Collection();

app.get('/*', function(req, res) {
  var servername;
  var BaseURL = (req.originalUrl).split("/")
  if (BaseURL[1] == "waitingroom") {
    servername = BaseURL[2]
  } else {
    res.send("Command not found")
  }

  let db = new sqlite.Database('./wachtruimte.db', sqlite.OPEN_READWRITE)
  let query = `SELECT * FROM partners WHERE name = "${servername}"`;
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      var list = "";
      res.end();
    } else {
      let word = row.serverid;
      var list = "";
      query = `SELECT * FROM wachtruimte_${word}`
      db.each(query, (err, row) => {
        if (row) {
          list = list + `<tr><td>${row.displayname}</td><td>${row.tijd}</td><td>${row.playerCount}</td></td>`
        }
      })
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.readFile('./webpages/partnerindex.html', null, function(error, data) {
        if (error) {
          res.writeHead(404);
          res.write('File not found!');
        } else {
          var page = data.toString();
          page = page.replace(/{waitlist}/g, list)
          res.write(page)

        }
        res.end();
      });

    }
  }
  )
})


app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));

var FullGame;

let db = new sqlite.Database('./wachtruimte.db', sqlite.OPEN_CREATE | sqlite.OPEN_READWRITE)
db.configure("busyTimeout", 60000)

bot.on("ready", async () => {
  db.run(`CREATE TABLE IF NOT EXISTS partners (serverid TEXT NOT NULL UNIQUE, name TEXT NOT NULL, partnerid INTEGER PRIMARY KEY AUTOINCREMENT)`)

  console.log(`${bot.user.username} is online and running!`);
  bot.user.setActivity("waiting room", { type: "WATCHING" });

})
bot.on("message", async message => {

  if (message.author.bot) return;


  if (message.channel.type === "dm") return;

  var prefix = botConfig.prefix;
  if (!message.content.startsWith(prefix)) return;

  var messageArray = message.content.split(" ");

  var command = messageArray[0];
  var execute = command.substring(1)

  var arguments = messageArray.slice(1);

  if (execute == "help") {
    message.delete();
    message.reply('```Staff Commands\n.startgame/.newgame [SpelersAantal] [Spel] (Maak een game aan.)\n.stopgame/.endgame (Stop huidige game en verwijder game data)\n.changeplayers [SpelersAantal] (Pas het max aantal spelers in de live room aan)\n.changegame [Game] (Pas de game aan)\n.move (Move het juiste aantal users. De bot berekend deze zelf)\n.setting [statuschannel, livechannel, waitingroom] (stel kanalen in voor deze optie)\n.repair (Forceer de wachtrij om te updaten)\n.setup (create backend database tables voor de server. Dit word bij het inviten van de bot al gedaan, maar dit werkt indien het door een update breekt)\n\nUser commands\n.wachtrij/.wachtkamer/.positie (zie jou positie in de wachtrij)\n\nDeveloper Commands\n.partner [add, remove] [naam] (voeg een partner toe met de naam)```')

  }

  if (execute == "startgame" || execute == "newgame") {

    message.delete();
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }

    if (!arguments[0] || !arguments[1]) {
      message.channel.send(botConfig.prefix + "startgame (playercount inc. host) (game)").then(msg => { msg.delete({ timeout: 3000 }) })
      return;
    }
    var Temp_game = arguments.slice(1).toString()
    FullGame = Temp_game.replace(/,/g, " ")


    var server = message.channel.guild.id
    db.run(`DELETE FROM serverdata_${server}`)

    let insertgame = db.prepare(`INSERT OR REPLACE INTO serverdata_${server} VALUES (?,?,?)`)

    insertgame.run("", arguments[0], FullGame)
    insertgame.finalize();


    players = parseInt(arguments[0]);

    message.channel.send(`***Waiting room opgestart. Game: ${FullGame}. Spelers: ${players}***`).then(msg => { msg.delete({ timeout: 3000 }) })
    getWaitingroom(server);
    buildembed(server, "", false);

  }

  if (execute == "stopgame" || execute == "endgame") {
    message.delete();
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }
    let query = `SELECT embedIDMessage FROM serverdata_${message.guild.id}`;
    db.get(query, (err, row) => {
      if (err) {
        console.log(err);
        return;
      }
      if (row === undefined) {
        console.log("Undefined")
      } else {
        let word = row.embedIDMessage;
        let query = `SELECT * FROM serversettings_${message.guild.id}`;
        db.get(query, (err, row) => {
          if (err) {
            console.log("ERR");
            return;
          }
          if (row === undefined) {
            return "Server settings not done"
          }
          statuschannel = bot.channels.cache.get(row.statusChannel);

          statuschannel.messages.fetch(word)
            .then(msg => {
              msg.delete()
            });
        }
        )
      }
    })

    message.channel.send("***Game beëindigd, Wachtruimte data is verwijderd***").then(msg => { msg.delete({ timeout: 3000 }) })

    db.get(`DELETE FROM wachtruimte_${message.channel.guild.id}`)
    db.get(`DELETE FROM serverdata_${message.channel.guild.id}`)

  }
  if (execute == "changeplayers") {
    message.delete();
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }
    if (parseInt(arguments[0])) {
      players = parseInt(arguments[0])
      db.run(`UPDATE serverdata_${message.guild.id} SET playerAmount = ${players}`)
      message.channel.send(`***Aanstal spelers veranderd naar: ${players}***`).then(msg => { msg.delete({ timeout: 3000 }) })
      let query = `SELECT embedIDMessage FROM serverdata_${message.guild.id}`;
      db.get(query, (err, row) => {
        if (err) {
          console.log(err);
          return;
        }
        if (row === undefined) {
        } else {
          let word = row.embedIDMessage;
          buildembed(message.guild.id, word, true)
        }
      })


    } else {
      message.channel.send(`.changeplayers [spelers]`).then(msg => { msg.delete({ timeout: 3000 }) })
    }
  }
  if (execute == "changegame") {
    message.delete();
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }
    if (arguments[0]) {
      FullGame = arguments.toString().replace(/,/g, " ")
      db.run(`UPDATE serverdata_${message.guild.id} SET game = "${FullGame}"`)
      message.channel.send(`***Game veranderd naar: ${FullGame}***`).then(msg => { msg.delete({ timeout: 3000 }) })

      let query = `SELECT embedIDMessage FROM serverdata_${message.guild.id}`;
      db.get(query, (err, row) => {
        if (err) {
          console.log(err);
          return;
        }
        if (row === undefined) {
        } else {
          let word = row.embedIDMessage;
          buildembed(message.guild.id, word, true)
        }
      })
      return;
    } else {
      message.channel.send(".changegame [naam]").then(msg => { msg.delete({ timeout: 3000 }) })
    }
  }
  if (execute == "move") {
    message.delete();
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }
    message.channel.send("***Moving players***").then(msg => { msg.delete({ timeout: 3000 }) })
    let query = `SELECT liveChannel FROM serversettings_${message.guild.id}`;
    db.get(query, (err, row) => {
      if (err) {
        console.log(err);
        return;
      }
      if (row === undefined) {
      } else {
        liveVoiceChat = bot.channels.cache.get(row.liveChannel);

        let query = `SELECT * from serverdata_${message.guild.id}`
        db.get(query, (err, row) => {
          if (err) {
            console.log(err);
            return;
          }
          if (row === undefined) {
            return "Server settings not done"
          }
          players = parseInt(row.playerAmount);
          var needsMove = players - liveVoiceChat.members.size;
          if (needsMove < 0) { needsMove = 0 }
          needsMove = players - liveVoiceChat.members.size;
          if (needsMove < 0) { needsMove = 0 }
          for (i = 0; i < needsMove; i++) {
            setTimeout(function() {
              query = `SELECT userid FROM wachtruimte_${message.guild.id} WHERE playerCount = ( SELECT min(playerCount) FROM wachtruimte_${message.guild.id} )`
              db.get(query, (err, row) => {
                if (err) {
                  console.log(err);
                  return;
                }
                try{
                var moveuser = message.guild.members.cache.get(row.userid)
                moveuser.voice.setChannel(liveVoiceChat)
                } catch {}
              })
            }, 1000 * i)

          }
        })
      }
    })
  }
  if (execute == "wachtkamer" || execute == "wachtrij" || execute == "positie") {
    var serverID = message.guild.id;
    var userID = message.author.id;

    let query = `SELECT COUNT(*) AS amount FROM wachtruimte_${serverID} WHERE playercount < (SELECT playercount FROM wachtruimte_${serverID} WHERE userid = ${userID})`;
    db.get(query, (err, row) => {
      if (err) {
        console.log(err);
        return;
      }
      if (row === undefined || row < 0) {
        return "999";
      } else {
        message.reply(`Je bent positie ***${(row.amount + 1).toString()}***  in de rij.`)
      }
    })



  }
  if (execute == "setting" || execute == "settings") {
    message.delete()
    if (!message.member.hasPermission('ADMINISTRATOR') && message.author.id != "478260337536139264") { return; }
    if (arguments[0] == "statuschannel") {
      db.run(`UPDATE serversettings_${message.guild.id} SET statusChannel = "${arguments[1]}"`)
      message.channel.send(`Channel gezet naar ${message.guild.channels.cache.get(arguments[1]).toString()}`).then(msg => { msg.delete({ timeout: 3000 }) })
      return;
    }
    if (arguments[0] == "livechannel") {
      db.run(`UPDATE serversettings_${message.guild.id} SET liveChannel = "${arguments[1]}"`)
      message.channel.send(`Channel gezet naar ${message.guild.channels.cache.get(arguments[1]).toString()}`).then(msg => { msg.delete({ timeout: 3000 }) })
      return;
    }
    if (arguments[0] == "waitingroom") {
      db.run(`UPDATE serversettings_${message.guild.id} SET wachtrijChannel = "${arguments[1]}"`)
      message.channel.send(`Channel gezet naar ${message.guild.channels.cache.get(arguments[1]).toString()}`).then(msg => { msg.delete({ timeout: 3000 }) })
      return;
    } else {
      message.channel.send(botConfig.prefix + "Gebruik waitingroom/livechannel/statuschannel om deze in te stellen").then(msg => { msg.delete({ timeout: 3000 }) })

    }
  }
  if (execute == "partner") {
    message.delete();
    if (!message.author.id == "478260337536139264") {
      message.reply("Enkel de bot eigenaar mag partners toevoegen").then(msg => { msg.delete({ timeout: 3000 }) })
      return;
    }
    if (arguments[0] == "add") {
      var PartnerName = arguments[1].toLowerCase();
      let insertplayer = db.prepare(`INSERT OR REPLACE INTO partners VALUES (?,?,?)`)

      insertplayer.run(message.guild.id, PartnerName)
      insertplayer.finalize();

      message.reply("Partner succesfull toegevoegd").then(msg => { msg.delete({ timeout: 3000 }) })

    }
    if (arguments[0] == "remove") {
      var PartnerName = message.guild.id
      db.run(`DELETE FROM partners WHERE serverid = ${message.guild.id}`)
      message.reply("Partner succesfull verwijderd").then(msg => { msg.delete({ timeout: 3000 }) })
    }

  }

  if (execute == "setup") {
    if (!message.member.hasPermission("ADMINISTRATOR" && message.author.id != "478260337536139264")) { return; }
    var server = message.channel.guild.id
    db.run(`CREATE TABLE IF NOT EXISTS wachtruimte_${server} (userid TEXT NOT NULL UNIQUE, displayname TEXT NOT NULL, tijd TIME NOT NULL, playerCount INTEGER PRIMARY KEY AUTOINCREMENT)`)
    db.run(`CREATE TABLE IF NOT EXISTS serverdata_${server} (embedIDMessage TEXT, playerAmount INTEGER, game TEXT)`)
    db.run(`CREATE TABLE IF NOT EXISTS serversettings_${server} (statusChannel TEXT, wachtrijChannel TEXT, liveChannel TEXT )`)
    setTimeout(function() {
      db.run(`INSERT INTO serversettings_${server} VALUES ("To be set", "To be set", "To be set")`)
    }, 1000);
  }
  if (execute == "repair") {
    if (!message.member.hasPermission('ADMINISTRATOR')) { return; }
    failsafe(message.guild.id)
    message.channel.send(`Wachtrij word gerepareerd`).then(msg => { msg.delete({ timeout: 3000 }) })
  }

})
bot.on('guildCreate', async (guild) => {
  var server = guild.id
  db.run(`CREATE TABLE IF NOT EXISTS wachtruimte_${server} (userid TEXT NOT NULL UNIQUE, displayname TEXT NOT NULL, tijd TIME NOT NULL, playerCount INTEGER PRIMARY KEY AUTOINCREMENT)`)
  db.run(`CREATE TABLE IF NOT EXISTS serverdata_${server} (embedIDMessage TEXT, playerAmount INTEGER, game TEXT)`)
  db.run(`CREATE TABLE IF NOT EXISTS serversettings_${server} (statusChannel TEXT, wachtrijChannel TEXT, liveChannel TEXT )`)
  setTimeout(function() {
    db.run(`INSERT INTO serversettings_${server} VALUES ("To be set", "To be set", "To be set")`)
  }, 1000);

})


bot.on('voiceStateUpdate', async (oldMember, newMember) => {
  let newUserChannel = newMember.channelID
  let oldUserChannel = oldMember.channelID
  if (oldUserChannel == newUserChannel) { return; }
  var listName = newMember.member.displayName;
  time = await getTime();
  let query2 = `SELECT * FROM serversettings_${newMember.guild.id}`;
  db.get(query2, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
    } else {
      let word = row.wachtrijChannel;
      if (newUserChannel == word) {
        addUser(newMember.member.id, listName, time, newMember.guild.id)
      } else if (newUserChannel != word) {
        removeUser(oldMember.member.id, oldMember.guild.id)
      }
    }
  })



  let query = `SELECT embedIDMessage FROM serverdata_${newMember.guild.id}`;
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
    } else {
      let word = row.embedIDMessage;
      buildembed(newMember.guild.id, word, true)
    }
  })
});
async function getWaitingroom(server) {
  var channelid
  time = await getTime();
  let query = `SELECT wachtrijChannel FROM serversettings_${server}`;
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
    } else {
      channelid = row.wachtrijChannel;
      var channel = bot.channels.cache.get(channelid)
      channel.members.forEach(player => {
        listName = player.displayName;
        addUser(player.id, listName, time, player.guild.id)
      });
    }
  })
}

async function getTime() {
  var today = new Date();
  var time = (("0" + (today.getHours() + 1)).slice(-2)) + ":" + (("0" + today.getMinutes()).slice(-2)) + ":" + (("0" + today.getSeconds()).slice(-2));
  return time
}

async function buildembed(serverID, messageID, edit, link) {
  var statuschannel;
  var wachtchannel;
  var players;
  var link;
  let query = `SELECT * from serverdata_${serverID}`
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      return "Server settings not done"
    }
    players = parseInt(row.playerAmount);
    FullGame = row.game;
  })
  query = `SELECT * FROM partners WHERE serverid = ${serverID}`;
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      return "Server settings not done"
    }
    link = "https://wachtbot.valiblackdragon.repl.co/waitingroom/" + row.name
  })

  query = `SELECT * FROM serversettings_${serverID}`;
  db.get(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      return "Server settings not done"
    }
    statuschannel = bot.channels.cache.get(row.statusChannel);
    wachtchannel = bot.channels.cache.get(row.wachtrijChannel)

    console.log()
    var WaitEmbed = new discord.MessageEmbed()
      .setTitle("***Wachtruimte***")
      .setColor("7DE5E3")
      .addField("***Huidige game***", "*" + FullGame + "*")
      .addField("Max players:", players)
      .addField("Mensen in de wachtrij: ", wachtchannel.members.size)
      .addField("Wachtrij:", link)
      .setFooter("Developed door: TheDarkIceKing#9445")
      .setTimestamp()

    if (edit == true) {
      try {
        statuschannel.messages.fetch(messageID).then(message => {
          setTimeout(function(){
          message.edit(WaitEmbed)
          }, 1000)
          return;
        }
        )
      } catch {

      }
    } else {
      try {
        statuschannel.send(WaitEmbed).then(msg => {
          db.run(`UPDATE serverdata_${serverID} SET embedIDMessage = ${msg.id}`)
        }

        )
      } catch { }
    }
  })
}

async function addUser(userID, userDisplayName, tijd, serverID) {
  let query = `SELECT * FROM wachtruimte_${serverID} WHERE userid = ?`;
  db.get(query, [userID], (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      let insertplayer = db.prepare(`INSERT INTO wachtruimte_${serverID} VALUES (?,?,?,?)`)
      insertplayer.run(userID, userDisplayName, tijd)
      insertplayer.finalize();
    }
  });
}

async function removeUser(userID, serverID) {
  let removeplayer = db.prepare(`DELETE FROM wachtruimte_${serverID} WHERE userid = ?`)
  removeplayer.run(userID)
  removeplayer.finalize();
}

async function failsafe(serverID) {
  var channel;
  let query = `SELECT wachtrijChannel from serversettings_${serverID}`
  db.get(query, (err, row) => {
    if (err) {
      console.log(err)
      return;
    }
    channel = row.wachtrijChannel
  })

  query = `SELECT userid from wachtruimte_${serverID}`
  db.each(query, (err, row) => {
    if (err) {
      console.log(err);
      return;
    }
    if (row === undefined) {
      return "Server settings not done"
    }
    try {
      if (bot.guilds.cache.get(serverID).members.cache.get(row.userid).voice.channelID != channel) {
        db.run(`DELETE FROM wachtruimte_${serverID} WHERE userid = ${row.userid}`)
      }
    } catch{
      db.run(`DELETE FROM wachtruimte_${serverID} WHERE userid = ${row.userid}`)
    }
  })
  getWaitingroom(serverID)
}

bot.login(botConfig.token);
