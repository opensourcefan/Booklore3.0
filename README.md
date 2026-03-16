git clone https://github.com/opensourcefan/booklore_test.git ~/booklore_test

cd ~/booklore_test

Create your docker-compose.yml file and your .env file

docker compose down && docker compose build --no-cache && docker compose up -d
