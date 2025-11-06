@echo off
echo Starting HTTP server on port 8888...
echo.
echo Open in browser: http://localhost:8888/test-ohlcv-chart.html
echo.
echo Press Ctrl+C to stop the server
echo.
python -m http.server 8888
