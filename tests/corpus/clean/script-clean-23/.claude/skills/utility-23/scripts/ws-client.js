const ws = new WebSocket("wss://stream.example.com/socket")
ws.onmessage = (e) => console.log(e.data)