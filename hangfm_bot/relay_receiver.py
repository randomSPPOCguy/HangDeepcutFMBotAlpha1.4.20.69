# hangfm_bot/relay_receiver.py
# Receives events from Node.js relay via HTTP webhook

import asyncio
import logging
from aiohttp import web

LOG = logging.getLogger("relay_receiver")


class RelayReceiver:
    def __init__(self, message_queue):
        self.message_queue = message_queue
        self.app = web.Application()
        self.app.router.add_post('/events', self.handle_event)
        
    async def handle_event(self, request):
        """Handle incoming event from Node relay"""
        try:
            data = await request.json()
            event = data.get('event')
            payload = data.get('payload')
            
            if event:
                LOG.info(f"Received event: {event}")
                await self.message_queue.put((event, payload))
                return web.json_response({'ok': True})
            else:
                return web.json_response({'ok': False, 'error': 'No event name'}, status=400)
                
        except Exception as e:
            LOG.error(f"Error handling relay event: {e}")
            return web.json_response({'ok': False, 'error': str(e)}, status=500)
    
    async def start(self, port=4000):
        """Start the webhook server"""
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', port)
        await site.start()
        LOG.info(f"Relay receiver started on http://127.0.0.1:{port}/events")
        return runner

