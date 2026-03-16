git clone https://github.com/opensourcefan/booklore_test.git ~/booklore_test
cd ~/booklore_test
# Create your .env file
docker compose down && docker compose build --no-cache && docker compose up -d
