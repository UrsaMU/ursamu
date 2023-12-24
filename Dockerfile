ARG BASE=denoland/deno:ubuntu
FROM $BASE

RUN apt-get -y update && apt-get -y install build-essential bash
RUN mkdir /ursamu
WORKDIR /ursamu
ADD deps.ts LICENSE README.md pup pup.jsonc ursamu_github_banner.png /ursamu/
ADD help/ /ursamu/help/
ADD src/ /ursamu/src/
RUN mkdir /ursamu/data
RUN deno run -A deps.ts
RUN deno run -A docker-deps.ts || true

VOLUME /ursamu/data
VOLUME /ursamu/text

CMD ["-c", "./pup run"]
ENTRYPOINT ["/bin/bash"]

# telnet, ws, http
EXPOSE 4201 4202 4203
