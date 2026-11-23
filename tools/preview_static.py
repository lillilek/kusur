"""Serve public site files only; never expose .private or source exports."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]

class PublicHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        name = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        if not re.fullmatch(r'(?:assets/[^/]+\.(?:css|js)|data/[^/]+\.(?:json|csv)|(?:index|corpus|texts|glossary)\.html)', name):
            self.send_error(404)
            return None
        target=(ROOT/name).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            self.send_error(404)
            return None
        return super().send_head()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8767)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(PublicHandler,directory=str(ROOT)))
    print(f'Кусурский сайт: http://127.0.0.1:{args.port}/corpus.html\nОстановка: Ctrl+C',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
