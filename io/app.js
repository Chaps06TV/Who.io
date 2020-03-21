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

		if(this.cards.length < rounds)
			rounds = this.cards.length;
	}

	get nextcard() {
		var card = "";
		do {
	    	card = this.cards[Math.floor(Math.random() * this.cards.length)];
	    } while (this.usedCards.includes(card));
		
	    this.usedCards.push(card);

		return card;
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
			clientToRoomBindingList.forEach(function(item) {
				if(item[2] === roomid) 
					peopleInLobby.push(item[1]);

				if(item[3] === true)
					countReady++;
			});
			
			socket.broadcast.emit('lobby-list', peopleInLobby);
			socket.emit('lobby-list', peopleInLobby);
			
			socket.broadcast.emit('playerready-update', countReady + "/" + peopleInLobby.length);
			socket.emit('playerready-update', countReady + "/" + peopleInLobby.length);
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
				roomid = item[2]
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
		
		socket.broadcast.emit('lobby-list', peopleInLobby);

		socket.broadcast.emit('playerready-update', countReady + "/" + peopleInLobby.length);
								
	});

	// == Game Management ==
	socket.on('playerready', function() {
		var room = "";
		clientToRoomBindingList.forEach(function(item) {
			if(item[0] === socket.id) {
				item[3] = true;
				room = item[2];
			}
		});

		var countTotal = 0;
		var countReady = 0;
		clientToRoomBindingList.forEach(function(item) {
			if(item[2] === room) {
				countTotal++;
			}
			if(item[3] === true) {
				countReady++;
			}
		});
		
		if(countReady === countTotal) {
			var question = "";

			roomList.forEach(function(item) {
				if(item[0] === room) {
					question = item[2].nextcard;
				}
			});

			socket.broadcast.emit('game-started', question);
			socket.emit('game-started', question);
		}
		else {
			socket.broadcast.emit('playerready-update', countReady + "/" + countTotal);
			socket.emit('playerready-update', countReady + "/" + countTotal);

	
		}

	});
	
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