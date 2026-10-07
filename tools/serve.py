#!/usr/bin/env python3
"""A local server for the map that answers byte ranges.

    python tools/serve.py [port]          (8765 when none is given)

The line tiles of the terrain layer (data/dod_lines.pmtiles) are one file read a piece
at a time, which `python -m http.server` cannot do: it sends the whole file whatever
is asked for. GitHub Pages answers ranges; this does the same on the laptop. It logs
nothing, so it never stops on a full pipe.
"""
import http.server, os, re, sys


class Handler(http.server.SimpleHTTPRequestHandler):
    left = None

    def send_head(self):
        self.left = None
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        m = re.match(r'bytes=(\d*)-(\d*)$', (rng or '').strip())
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        if a == '' and b == '':
            return super().send_head()
        if a == '':
            start, end = max(0, size - int(b)), size - 1
        else:
            start, end = int(a), min(int(b) if b else size - 1, size - 1)
        if start > end or start >= size:
            self.send_error(416)
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self.left = end - start + 1
        return f

    def copyfile(self, src, dst):
        if self.left is None:
            return super().copyfile(src, dst)
        left, self.left = self.left, None
        while left > 0:
            buf = src.read(min(65536, left))
            if not buf:
                break
            dst.write(buf)
            left -= len(buf)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
