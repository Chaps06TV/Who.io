var app = require('express'),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    ent = require('ent'), // Permet de bloquer les caractères HTML (sécurité équivalente à htmlentities en PHP)
    path = require('path'),
    fs = require('fs'),
    lineReader = require('line-reader');;

// Class for the game
class Game {
	constructor(lobbyname, rounds, deck) {
		this.name = lobbyname;
		this.rounds = rounds;
		this.cards = deck;
		this.usedCards = new Array();

		this.currentround = 0;
		this.currentquestion = "";
		this.currentvotes = new Array(2);
		this.votecount = 0;
		this.waitlistcount = 0;

		this.history = new Array(2);

		if(this.cards.length < rounds)
			rounds = this.cards.length;
	}

	get nextcard() {
		var card = "";
		if(!(this.currentround >= this.rounds)) {
			do {
		    	card = this.cards[Math.floor(Math.random() * this.cards.length)];
		    } while (this.usedCards.includes(card));
			
		    this.usedCards.push(card);
		} 
		else {
			card = null;
		}

	    this.currentround++;

		this.currentvotes = new Array(2);

		this.votecount = 0;

		this.currentquestion = card;

		return card;
	}

	get getquestion() {
		return this.currentquestion;
	}

	get getround() {
		return this.currentround;
	}

	get getvotecount() {
		return this.votecount;
	}

	get voteresults() {
		return this.currentvotes;
	}

	get finalhistory() {
		return this.history;
	}

	get getwaitlist() {
		return this.waitlistcount;
	}

	set newvote(username) {
		var isNew = true;
		this.currentvotes.forEach(function(item) {
			if(item[0] === username){
				item[1] += 1;
				isNew = false;
			}
		});

		if(isNew)
			this.currentvotes.push([username, 1]);

		this.votecount += 1;
		
	}

	set addwaitlist(amount) {
		this.waitlistcount += amount;
	}

	set resetwaitlist(sure) {
		if(sure)
			this.waitlistcount = 0;
	}

	set insertwinner(winner) {
		var temp = this.currentquestion;
		var isNew = true;
		this.history.forEach(function(item) {
			if(item[0] === winner){
				item[1].push(temp);
				isNew = false;
			}
		});

		if(isNew)
			this.history.push([winner, [temp]]);

	}
}



var connectionList = new Array(2);

// Room ID | Rounds | Game
var roomList = new Array();

// Socket ID | Username | Room ID | Ready
var clientToRoomBindingList = new Array(2);
	
io.sockets.on('connection', function(socket){
	
	// == Connection management ==
	socket.on('game-client', function(name, roomid) {
		SaveConnection(socket.id);
		SetSessionType(socket.id,"game-client");
		console.log('\x1b[33m%s\x1b[37m%s\x1b[0m', GetConnection(socket.id), " connected");
		OutSessions();
		
		var isOk = false;
		for (var i = 0; i <roomList.length; i++) {
			if(roomList[i][0] === roomid){
				isOk = true;
			}
		}
		
		if(isOk) {
			clientToRoomBindingList.push([socket.id, name, roomid, false]);
			
			var peopleInLobby = new Array();
			var countReady = 0;
			var round = 0;

			clientToRoomBindingList.forEach(function(item) {
				if(item[2] === roomid) 
					peopleInLobby.push(item[1]);

				if(item[3] === true)
					countReady++;
			});

			roomList.forEach(function(item) {
				if(item[0] === roomid) {
					round = item[2].getround;
				}
			});

			socket.broadcast.emit('lobby-list', peopleInLobby, roomid);
			socket.emit('lobby-list', peopleInLobby, roomid);

			// If the game is already started, tell the new socket to wait
			if(round > 0) {
				var question = "";
				roomList.forEach(function(item) {
					if(item[0] === roomid) {
						item[2].addwaitlist = 1;
						question = item[2].getquestion;
					}
				});

				socket.emit('game-started-wait', question);
			} 
			else {
				socket.broadcast.emit('playerready-update', countReady + "/" + peopleInLobby.length, roomid);
				socket.emit('playerready-update', countReady + "/" + peopleInLobby.length, roomid);
			}
			
		}
		else {
			socket.emit('error-nolobby');
		}
		
	});
	
	socket.on('create-client', function() {
		SaveConnection(socket.id);
		SetSessionType(socket.id,"create-client");
		console.log('\x1b[33m%s\x1b[37m%s\x1b[0m', GetConnection(socket.id), " connected");
		OutSessions();
		
	});
	
	socket.on('create-lobby', function(roomid, rounds) {
		roomList.push([roomid,rounds, new Game(roomid,rounds,DeckToArray("./deck1.txt"))]);
		
	});
	
	socket.on('disconnect', function() {
		console.log('\x1b[33m%s\x1b[37m%s\x1b[0m', GetConnection(socket.id), " disconnected");
    	DelConnection(socket.id);
		
		var roomid = "";	
		var countReady = 0;
		clientToRoomBindingList.forEach(function(item, i) {
			if(item[0] === socket.id){
				roomid = item[2];
				clientToRoomBindingList.splice(i,1);
			}
			if(item[3] === true)
				countReady++;
		});
		
		var peopleInLobby = new Array();
		clientToRoomBindingList.forEach(function(item) {
			if(item[2] === roomid) {
				peopleInLobby.push(item[1]);
			}
		});

		socket.broadcast.emit('lobby-list', peopleInLobby, roomid);

		socket.broadcast.emit('playerready-update', countReady + "/" + peopleInLobby.length, roomid);

		//CleanupRooms();
								
	});

	// === Game Management ===
	socket.on('playerready', function() {
		var room = "";
		var currentround = 0;
		var waitlistcount = 0;
		var countTotal = 0;
		var countReady = 0;

		// Find the socket in the list, mark it as ready and take the room id
		clientToRoomBindingList.forEach(function(item) {
			if(item[0] === socket.id) {
				item[3] = true;
				room = item[2];
			}
		});

		// Count the nb of people present and ready 
		clientToRoomBindingList.forEach(function(item) {
			if(item[2] === room) {
				countTotal++;
			}
			if(item[2] === room && item[3] === true) {
				countReady++;
			}
		});

		roomList.forEach(function(item) {
			if(item[0] === room) {
				currentround = item[2].getround;
				waitlistcount = item[2].getwaitlist;
			}
		});
		
		// If everybody is ready, draw first question (or get the current question if joining in the middle of the game)
		if(countReady === countTotal - waitlistcount) {

			// If the game is already on, tell the new socket to wait
			if(currentround > 0) {

			}
			else {
				NewRound(room);
			}
			
		}
		else {
			// Update the nb ready
			socket.broadcast.emit('playerready-update', countReady + "/" + countTotal, room);
			socket.emit('playerready-update', countReady + "/" + countTotal, room);
	
		}

	});

	socket.on('playervoted', function(username, roomid) {
		var voteCount = 0;
		var votes = new Array(2);
		var waitlistcount = 0;
		roomList.forEach(function(item) {
			if(item[0] === roomid) {
				item[2].newvote = username;
				voteCount = item[2].getvotecount;
				votes = item[2].voteresults;
				waitlistcount = item[2].getwaitlist;
			}
		});

		// Check if everybody voted
		var countTotal = 0;
		clientToRoomBindingList.forEach(function(item) {
			if(item[2] === roomid)
				countTotal++;
		});
		
		if(voteCount == countTotal - waitlistcount) {
			var most = "";
			var mostNum = 0;
			votes.forEach(function(item) {
				if(item[1] > mostNum) {
					most = item[0];
					mostNum = item[1];
				}
			});

			socket.broadcast.emit('voteresult', votes, most, mostNum, roomid);
			socket.emit('voteresult', votes, most, mostNum, roomid);

			roomList.forEach(function(item) {
				if(item[0] === roomid)
					item[2].insertwinner = most;
			});

			setTimeout(NewRound, 5000, roomid);

		}

	});

	function NewRound(room) {
		var card = "";
		var round = 0;
		roomList.forEach(function(item) {
			if(item[0] === room) {
				card = item[2].nextcard;
				round = item[2].getround;
				item[2].resetwaitlist = true;
			}
		});

		if(card === null) {
			// Gamed ended
			var scoreboard = new Array(2);
			roomList.forEach(function(item) {
				if(item[0] === room) {
					scoreboard = item[2].finalhistory;
				}
			});

			socket.broadcast.emit('end', scoreboard, room);
			socket.emit('end', scoreboard, room);	
		}
		else {
			socket.broadcast.emit('newround', card, round, room);
			socket.emit('newround', card, round, room);	
		}

	}
	
	
});

server.listen(8080);

console.log("== Server running ==");

// Functions for the game

function CleanupRooms() {
	roomList.forEach(function(item, i) {
		var isDeleting = true;
		clientToRoomBindingList.forEach(function(clientitem) {
			if(item[0] === clientitem[2]) {
				isDeleting = false;
			}
		});

		if(isDeleting) {
			roomList.splice(i,1);
		}
	});
}

function DeckToArray(deck) {
	var arrayDeck = new Array();
	lineReader.eachLine(path.join(__dirname, deck), function(line) {
	    arrayDeck.push(line);
	});
	
	return arrayDeck;
}


// Functions for the connections manager

function SaveConnection(id) {
	var idClient = 1;
	var fini = false;
	while(!fini) {
		var ok = true;
		for(var i = 2; i < connectionList.length; i++)
			if(connectionList[i][1] == ("Client " + idClient)) { 
				idClient++;
				ok = false;
			}
		if (ok) fini = true;
	}


	connectionList.push([id, "Client " + idClient]);
}

function SetSessionType(id,type) {
	for(var i = 2; i < connectionList.length; i++)
		if(connectionList[i][0] == id) { connectionList[i][2] = type;}
}

function GetConnection(id) {
	for(var i = 2; i < connectionList.length; i++)
		if(connectionList[i][0] == id) { return connectionList[i][1];}
}

function DelConnection(id) {
	for(var i = 2; i < connectionList.length; i++)
		if(connectionList[i][0] == id) { connectionList.splice(i,1);}
}

function OutSessions() {
	console.log('==================== Connections =====================');
	console.log('           ID           ||  # Client   || Session Type');
	console.log('------------------------------------------------------');
	for(var i = 2; i < connectionList.length; i++) {
		console.log(' ', connectionList[i][0], ' || ', connectionList[i][1], connectionList[i][1].length == 8 ? ' ' : '', '|| ', connectionList[i][2]);
	}
	console.log('======================================================');
}