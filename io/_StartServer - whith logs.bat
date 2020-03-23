@echo off
cls
echo =- Starting NodeJS server for the app Who.io -= > who.io_nodejs_logs.txt
node app.js >> who.io_nodejs_logs.txt
echo =- NodeJS server stopped -= >> who.io_nodejs_logs.txt