FROM python:3.11.0-bullseye as base

ARG TARGETARCH
RUN echo "TARGETARCH for ${TARGETARCH}"

# amd64 系の処理
FROM --platform=linux/amd64 base as stage-amd64

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"

# arm64 系の処理
FROM --platform=linux/arm64 base as stage-arm64

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_arm64/session-manager-plugin.deb" -o "session-manager-plugin.deb"

FROM stage-${TARGETARCH:-amd64} as final

# install the latest nodejs & npm & other
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt update \
    && apt-get install -y nodejs \
    && apt clean

# install the latest AWS CDK
RUN npm install -g aws-cdk

# install the latest AWSCLI
RUN apt update \
    && apt-get install -y groff \
    && apt-get install -y less \
    && apt clean
RUN unzip awscliv2.zip \
    && ./aws/install

# install the latest SessionManagerPlugin
RUN dpkg -i session-manager-plugin.deb
