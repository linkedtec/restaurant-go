# Start from a Debian image with the latest version of Go installed
# and a workspace (GOPATH) configured at /go.
FROM golang

# Copy the local package files to the container's workspace.
ADD . /go/src/github.com/core433/restaurant-go
ADD ../../lib/pq /go/src/github.com/lib/pq

# Build the restaurant-go command inside the container.
# (You may fetch or manage dependencies here,
# either manually or with a tool like "godep".)
RUN go install github.com/lib/pq
RUN go install github.com/core433/restaurant-go

# Run the restaurant-go command by default when the container starts.
ENTRYPOINT /go/bin/restaurant-go

# Document that the service listens on port 8080.
EXPOSE 8080