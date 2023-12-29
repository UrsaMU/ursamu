# UrsaMU

### The Modern MUSH-Like Server

![ursamu header](ursamu_github_banner.png)

## What is UrsaMU?

UrsaMU is a MUSH-like server written in Typescript. It is designed to be a
modern, and extensible MUSH-like server.

## What is a MUSH?

A MUSH is a text-based, multi-user, real-time virtual environment. It is a
descendant of MUDs, which were the precursors to modern MMORPGs. MUSHes are
designed to be highly extensible, and are often used for role-playing games, or
social environments.

## What is a MUSH-like?

A MUSH-like is a server that is similar to a MUSH, but is not a MUSH. UrsaMU is
a MUSH-like because it is not a MUSH, but it is similar to a MUSH.

## Starting the server

To start the server in 'production' mode, make sure you have node installed, I
suggest NVM, and then from the `ursamu` folder run:

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
./pup
```

To start the Ursamu server, you can use the following command:

```bash
./pup
```

To stop the Ursamu server, you can use the following command:

```bash
./pup terminate
```

## Docker

It is easy to run the game under docker:

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
sudo docker-compose up -d
```

The game database will be exported to the `data/` directory on the host
filesystem, for easy backups.

## Development on ARM macOS

Deno on ARM can be finicky right now. Here's a workaround:

```bash
git clone https://github.com/LukeChannings/deno-arm64.git deno-arm
cd deno-arm
sudo docker build -t deno-arm
cd ..
git clone https://github.com/ursamu/ursamu.git
cd ursamu
echo "BASE=deno-arm" > .env
sudo docker-compose up -d
```

## License

Ursamu is licensed under the MIT License.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to
discuss what you would like to change.
