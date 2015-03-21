# Start from a Debian image with the latest version of Go installed
# and a workspace (GOPATH) configured at /go.
FROM golang

# Copy the local package files to the container's workspace.
ADD . /go/src/github.com/core433/restaurant-go

# Fetch postgres DB dependency
# (You may fetch or manage dependencies here,
# either manually or with a tool like "godep".)
RUN go get github.com/lib/pq

# Docker is currently only run on production server, setting this env
# will let it know to use the correct production DB
ENV RESTAURANT_PRODUCTION 1

# Currently building and running out of src dir.  This seems incorrect, but
# all the HTML / js src files are in there and I couldn't find an elegant
# way to copy them to go's bin directory when running go install
WORKDIR /go/src/github.com/core433/restaurant-go
RUN go build

# Run the restaurant-go command by default when the container starts.
#ENTRYPOINT /go/bin/restaurant-go
ENTRYPOINT /go/src/github.com/core433/restaurant-go/restaurant-go


# Document that the service listens on port 8080.
EXPOSE 8080