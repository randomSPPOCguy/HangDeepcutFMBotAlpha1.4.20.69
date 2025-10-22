# message_queue.py
import asyncio
import logging

class MessageQueue:
    def __init__(self, maxsize=100):
        self.queue = asyncio.Queue(maxsize=maxsize)
        logging.debug(f"MessageQueue initialized with maxsize={maxsize}")

    async def put(self, item):
        await self.queue.put(item)

    async def get(self):
        return await self.queue.get()

    async def worker(self, handler):
        while True:
            item = await self.queue.get()
            try:
                await handler(item)
            except Exception as e:
                logging.exception(f"Error processing message queue item: {e}")
            finally:
                self.queue.task_done()

    async def run_workers(self, handler, num_workers=1):
        tasks = [asyncio.create_task(self.worker(handler)) for _ in range(num_workers)]
        logging.info(f"Started {num_workers} message queue worker(s)")
        await asyncio.gather(*tasks)

