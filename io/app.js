var app = require('express'),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    ent = require('ent'), // Permet de bloquer les caractères HTML (sécurité équivalente à htmlentities en PHP)
    fs = require('fs');
	
var connectionList = new Array(2);

var roomList = new Array();
var clientToRoomBindingList = new Array(2);
	
io.sockets.on('connection', function(socket){
	
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
			clientToRoomBindingList.push([socket.id, name,roomid]);
			
			var peopleInLobby = new Array();
			clientToRoomBindingList.forEach(function(item) {
				if(item[2] === roomid) {
					peopleInLobby.push(item[1]);
				}
			});
			
			socket.broadcast.emit('lobby-list', peopleInLobby);
			socket.emit('lobby-list', peopleInLobby);
		}
		
	});
	
	socket.on('create-client', function() {
		SaveConnection(socket.id);
		SetSessionType(socket.id,"create-client");
		console.log('\x1b[33m%s\x1b[37m%s\x1b[0m', GetConnection(socket.id), " connected");
		OutSessions();
		
	});
	
	socket.on('create-lobby', function(roomid, rounds) {
		roomList.push([roomid,rounds]);
		
	});
	
	socket.on('disconnect', function() {
		console.log('\x1b[33m%s\x1b[37m%s\x1b[0m', GetConnection(socket.id), " disconnected");
    	DelConnection(socket.id);
		
		var roomid = "";	
		
		clientToRoomBindingList.forEach(function(item, i) {
			if(item[0] === socket.id){
				roomid = item[2]
				clientToRoomBindingList.splice(i,1);
			}
		});
		
		var peopleInLobby = new Array();
		clientToRoomBindingList.forEach(function(item) {
			if(item[2] === roomid) {
				peopleInLobby.push(item[1]);
			}
		});
		
		socket.broadcast.emit('lobby-list', peopleInLobby);
		
		
						
	});
	
});

server.listen(8080);

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