package server

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/Velocidex/ordereddict"
	"www.velocidex.com/golang/velociraptor/vql"
	vql_subsystem "www.velocidex.com/golang/velociraptor/vql"
	"www.velocidex.com/golang/vfilter"
	"www.velocidex.com/golang/vfilter/arg_parser"
)

type LinkToFunctionArgs struct {
	Type     string `vfilter:"optional,field=type,doc=The type of link. Currently one of collection, hunt, artifact, event"`
	ClientId string `vfilter:"optional,field=client_id"`
	FlowId   string `vfilter:"optional,field=flow_id"`
	Tab      string `vfilter:"optional,field=tab,doc=The tab to focus - can be overview, request, results, logs, notebook"`
	Text     string `vfilter:"optional,field=text,doc=If specified we emit a markdown style URL with a text"`

	HuntId   string `vfilter:"optional,field=hunt_id,doc=The hunt id to read."`
	Artifact string `vfilter:"optional,field=artifact,doc=The artifact to retrieve"`
	OrgId    string `vfilter:"optional,field=org,doc=If set the link accesses a different org. Otherwise we accesses the current org."`
}

type LinkToFunction struct{}

func (self *LinkToFunction) Call(ctx context.Context,
	scope vfilter.Scope,
	args *ordereddict.Dict) vfilter.Any {

	arg := &LinkToFunctionArgs{}
	err := arg_parser.ExtractArgsWithContext(ctx, scope, args, arg)
	if err != nil {
		scope.Log("link_to: %s", err.Error())
		return vfilter.Null{}
	}

	config_obj, ok := vql_subsystem.GetServerConfig(scope)
	if !ok || config_obj.GUI == nil {
		scope.Log("link_to: Command can only run on the server")
		return vfilter.Null{}
	}

	if config_obj.GUI.PublicUrl == "" {
		scope.Log("link_to: Invalid configuration! GUI.public_url must be the public URL over which the GUI is served!")
		return vfilter.Null{}
	}

	url, err := url.Parse(config_obj.GUI.PublicUrl)
	if err != nil {
		scope.Log("link_to: Invalid configuration! GUI.public_url must be the public URL over which the GUI is served!: %v", err)
		return vfilter.Null{}
	}

	org := arg.OrgId
	if org == "" {
		org = config_obj.OrgId
	}

	query := url.Query()
	if !query.Has("org_id") {
		query.Set("org_id", org)
		url.RawQuery = query.Encode()
	}

	switch strings.ToLower(arg.Type) {
	case "", "collection":
		if arg.ClientId == "" || arg.FlowId == "" {
			scope.Log("link_to: For collection link both client_id and flow_id must be set")
			return vfilter.Null{}
		}

		tab := arg.Tab
		if tab == "" {
			tab = "overview"
		}
		url.Fragment = fmt.Sprintf("/collected/%v/%v/%v", arg.ClientId, arg.FlowId, tab)
		return formatURL(arg.Text, url)

	case "hunt":
		if arg.HuntId == "" {
			scope.Log("link_to: For hunt links hunt_id must be set")
			return vfilter.Null{}
		}

		tab := arg.Tab
		if tab == "" {
			tab = "overview"
		}
		url.Fragment = fmt.Sprintf("/hunts/%v/%v", arg.HuntId, tab)
		return formatURL(arg.Text, url)

	case "artifact":
		if arg.Artifact == "" {
			scope.Log("link_to: For artifact links artifact parameter must be set")
			return vfilter.Null{}
		}

		url.Fragment = fmt.Sprintf("/artifacts/%v", arg.Artifact)
		return formatURL(arg.Text, url)

	case "event":
		if arg.Artifact == "" || arg.ClientId == "" {
			scope.Log("link_to: For event links both artifact and client_id parameters must be set")
			return vfilter.Null{}
		}

		url.Fragment = fmt.Sprintf("/events/%v/%v", arg.ClientId, arg.Artifact)
		return formatURL(arg.Text, url)

	default:
		scope.Log("link_to: Supported link types must be one of collection, hunt, artifact, event")
		return vfilter.Null{}
	}
}

func formatURL(text string, url *url.URL) string {
	if text == "" {
		return url.String()
	}
	return fmt.Sprintf("[%s](%v)", text, url.String())
}

func (self *LinkToFunction) Info(
	scope vfilter.Scope, type_map *vfilter.TypeMap) *vfilter.FunctionInfo {
	return &vfilter.FunctionInfo{
		Name:     "link_to",
		Doc:      "Create a url linking to a particular part in the Velociraptor GUI.",
		ArgType:  type_map.AddType(scope, &LinkToFunctionArgs{}),
		Metadata: vql.VQLMetadata().Build(),
	}
}

func init() {
	vql_subsystem.RegisterFunction(&LinkToFunction{})
}