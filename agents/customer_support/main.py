"""Entry point. Run with: python main.py"""

import os

import uvicorn

from agent import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=os.environ.get("HOST", "0.0.0.0"), port=port)
