FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV COMSOL_NP=4
ENV COMSOL_PORT=2036

# Instalacja zależności
RUN apt-get update && apt-get install -y \
    libxt6 libxext6 libxrender1 libglu1-mesa libxi6 \
    openjdk-17-jre \
    curl unzip lsb-release \
    p7zip-full xorriso file \
    && rm -rf /var/lib/apt/lists/*

# Utwórz katalog na instalację
WORKDIR /opt/comsol

# Skopiuj plik ISO i plik licencyjny
COPY COMSOL62_dvd.iso /tmp/comsol.iso
COPY LMCOMSOL_Server_6.2_SSQ.lic /opt/comsol/license.lic

# Skopiuj skrypt workaround
COPY COMSOL_Server_Workaround.sh /opt/comsol/workaround.sh
RUN chmod +x /opt/comsol/workaround.sh

# Utwórz katalog na ekstraktowane pliki z ISO
RUN mkdir -p /tmp/iso_extract

# Wyekstraktuj ISO i zainstaluj COMSOL
RUN cd /tmp && \
    7z x comsol.iso -oiso_extract && \
    cd iso_extract && \
    # Użyj właściwego installatora dla Linuksa x64
    INSTALLER="./bin/glnxa64/setuplauncher" && \
    if [ -f "$INSTALLER" ]; then \
        echo "Używam installatora Linux x64: $INSTALLER" && \
        chmod +x "$INSTALLER" && \
        "$INSTALLER" -s -opt /opt/comsol -license /opt/comsol/license.lic; \
    else \
        echo "Nie znaleziono installatora Linux x64, próbuję główny setup" && \
        INSTALLER="./setup" && \
        if [ -f "$INSTALLER" ]; then \
            chmod +x "$INSTALLER" && \
            "$INSTALLER" -s -opt /opt/comsol -license /opt/comsol/license.lic; \
        else \
            echo "Nie znaleziono żadnego installatora" && \
            exit 1; \
        fi; \
    fi

# Zachowaj wyekstraktowane pliki dla skryptu workaround
RUN mv /tmp/iso_extract /opt/comsol/installation_source && \
    rm /tmp/comsol.iso

# Dodaj entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 2036 2037 2038

ENTRYPOINT ["/entrypoint.sh"]
