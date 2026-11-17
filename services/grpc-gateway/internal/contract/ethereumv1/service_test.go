package ethereumv1

import (
	"context"
	"testing"

	"google.golang.org/protobuf/types/known/structpb"
)

func TestServiceDescriptorMatchesPublishedContract(t *testing.T) {
	t.Parallel()
	if ServiceName != "nodezuno.ethereum.v1.EthereumProxy" {
		t.Fatalf("ServiceName = %q", ServiceName)
	}
	if CallFullMethodName != "/nodezuno.ethereum.v1.EthereumProxy/Call" {
		t.Fatalf("CallFullMethodName = %q", CallFullMethodName)
	}
	if EthereumProxyServiceDesc.ServiceName != ServiceName {
		t.Fatalf(
			"descriptor service = %q, want %q",
			EthereumProxyServiceDesc.ServiceName,
			ServiceName,
		)
	}
	if len(EthereumProxyServiceDesc.Methods) != 1 ||
		EthereumProxyServiceDesc.Methods[0].MethodName != "Call" {
		t.Fatalf("descriptor methods = %#v", EthereumProxyServiceDesc.Methods)
	}
	if len(EthereumProxyServiceDesc.Streams) != 0 {
		t.Fatalf("descriptor streams = %#v", EthereumProxyServiceDesc.Streams)
	}
	if EthereumProxyServiceDesc.Metadata !=
		"nodezuno/ethereum/v1/ethereum_proxy.proto" {
		t.Fatalf("descriptor metadata = %v", EthereumProxyServiceDesc.Metadata)
	}

	var _ EthereumProxyServer = structRequestServer{}
}

type structRequestServer struct{}

func (structRequestServer) Call(
	_ context.Context,
	_ *structpb.Struct,
) (*structpb.Struct, error) {
	return &structpb.Struct{}, nil
}
