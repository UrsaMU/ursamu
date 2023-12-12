FROM denoland/deno:alpine

RUN apk update && apk add alpine-sdk bash
RUN mkdir /ursamu
WORKDIR /ursamu
ADD LICENSE package-lock.json package.json \
    README.md tsconfig.json ursamu.config.js ursamu_github_banner.png \
    /ursamu/
ADD help/ /ursamu/help/
ADD src/ /ursamu/src/
ADD text/ /ursamu/text/
RUN npm ci
RUN mkdir /ursamu/data

VOLUME /ursamu/data

CMD ["-c", "./pup"]
ENTRYPOINT ["/bin/bash"]

# telnet, ws, http
EXPOSE 4201 4202 4203
