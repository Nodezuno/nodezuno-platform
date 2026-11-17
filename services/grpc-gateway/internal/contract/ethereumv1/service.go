// Package ethereumv1 contains the native gRPC service contract.
//
// The protobuf contract intentionally uses google.protobuf.Struct at its
// boundary. This keeps the Ethereum JSON-RPC result shape lossless for the
// standard hex-encoded Ethereum quantities while avoiding a generated message
// for every upstream method. The service and method names must remain aligned
// with proto/nodezuno/ethereum/v1/ethereum_proxy.proto.
package ethereumv1

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/structpb"
)

const (
	// ServiceName is the fully qualified protobuf service name.
	ServiceName = "nodezuno.ethereum.v1.EthereumProxy"
	// CallFullMethodName is the fully qualified unary method name.
	CallFullMethodName = "/nodezuno.ethereum.v1.EthereumProxy/Call"
)

// EthereumProxyClient is the client API for EthereumProxy.
type EthereumProxyClient interface {
	Call(
		ctx context.Context,
		in *structpb.Struct,
		opts ...grpc.CallOption,
	) (*structpb.Struct, error)
}

type ethereumProxyClient struct {
	connection grpc.ClientConnInterface
}

// NewEthereumProxyClient constructs a client for the native gRPC boundary.
func NewEthereumProxyClient(connection grpc.ClientConnInterface) EthereumProxyClient {
	return &ethereumProxyClient{connection: connection}
}

func (client *ethereumProxyClient) Call(
	ctx context.Context,
	in *structpb.Struct,
	opts ...grpc.CallOption,
) (*structpb.Struct, error) {
	out := new(structpb.Struct)
	if err := client.connection.Invoke(ctx, CallFullMethodName, in, out, opts...); err != nil {
		return nil, err
	}
	return out, nil
}

// EthereumProxyServer is implemented by the native gRPC proxy.
type EthereumProxyServer interface {
	Call(context.Context, *structpb.Struct) (*structpb.Struct, error)
}

// RegisterEthereumProxyServer registers the native proxy contract.
func RegisterEthereumProxyServer(
	registrar grpc.ServiceRegistrar,
	server EthereumProxyServer,
) {
	registrar.RegisterService(&EthereumProxyServiceDesc, server)
}

func callHandler(
	server any,
	ctx context.Context,
	decode func(any) error,
	interceptor grpc.UnaryServerInterceptor,
) (any, error) {
	in := new(structpb.Struct)
	if err := decode(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return server.(EthereumProxyServer).Call(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     server,
		FullMethod: CallFullMethodName,
	}
	handler := func(ctx context.Context, request any) (any, error) {
		return server.(EthereumProxyServer).Call(ctx, request.(*structpb.Struct))
	}
	return interceptor(ctx, in, info, handler)
}

// EthereumProxyServiceDesc is the grpc.ServiceDesc for EthereumProxy.
var EthereumProxyServiceDesc = grpc.ServiceDesc{
	ServiceName: ServiceName,
	HandlerType: (*EthereumProxyServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "Call",
			Handler:    callHandler,
		},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "nodezuno/ethereum/v1/ethereum_proxy.proto",
}
