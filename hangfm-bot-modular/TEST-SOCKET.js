// Quick test to see if socket connects
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.resolve(__dirname, '..', 'hang-fm-config.env') });

const { SocketClient } = require('ttfm-socket');

console.log('=== SOCKET CONNECTION TEST ===');
console.log('BOT_USER_TOKEN:', process.env.BOT_USER_TOKEN ? `${process.env.BOT_USER_TOKEN.substring(0, 20)}...` : 'MISSING');
console.log('ROOM_ID:', process.env.ROOM_ID || 'MISSING');

async function test() {
  try {
    console.log('\n1. Creating SocketClient...');
    const socket = new SocketClient('https://socket.prod.tt.fm');
    console.log('✅ SocketClient created');
    
    console.log('\n2. Joining room...');
    const connection = await socket.joinRoom(process.env.BOT_USER_TOKEN, {
      roomUuid: process.env.ROOM_ID
    });
    
    console.log('✅ SOCKET CONNECTED SUCCESSFULLY!');
    console.log('Room:', connection.state?.room?.name || 'Unknown');
    console.log('Bot:', connection.state?.selfProfile?.name || 'Unknown');
    console.log('Users in room:', connection.state?.users?.length || 0);
    console.log('\n🎉 Bot should now be VISIBLE in the room!');
    console.log('Keeping connection alive...');
    
    // Keep alive
    setInterval(() => {
      console.log('💓 Still connected...');
    }, 30000);
    
  } catch (error) {
    console.error('\n❌ SOCKET CONNECTION FAILED:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();

