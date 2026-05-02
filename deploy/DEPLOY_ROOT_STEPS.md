1. Install the Nginx vhost:
   `sudo cp /home/secondengine/ultimate-screener/deploy/nginx/ultimate-screener.conf /etc/nginx/sites-available/ultimate-screener`

2. Enable the site:
   `sudo ln -s /etc/nginx/sites-available/ultimate-screener /etc/nginx/sites-enabled/ultimate-screener`

3. Remove the default site if it is still enabled:
   `sudo rm -f /etc/nginx/sites-enabled/default`

4. Validate and reload Nginx:
   `sudo nginx -t && sudo systemctl reload nginx`

5. Enable PM2 startup on boot:
   `sudo env PATH=$PATH:/home/secondengine/.nvm/versions/node/v24.15.0/bin pm2 startup systemd -u secondengine --hp /home/secondengine`

6. Issue the TLS certificate and enable HTTPS:
   `sudo certbot --nginx -d ultimate-screener.ebite.biz.id`
