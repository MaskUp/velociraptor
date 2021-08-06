package server

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"errors"
	"sync"
	"time"

	"github.com/Velocidex/ordereddict"
	config_proto "www.velocidex.com/golang/velociraptor/config/proto"
	"www.velocidex.com/golang/velociraptor/crypto/client"
	crypto_proto "www.velocidex.com/golang/velociraptor/crypto/proto"
	crypto_utils "www.velocidex.com/golang/velociraptor/crypto/utils"
	"www.velocidex.com/golang/velociraptor/datastore"
	"www.velocidex.com/golang/velociraptor/logging"
	"www.velocidex.com/golang/velociraptor/paths"
	"www.velocidex.com/golang/velociraptor/services/journal"
)

type ServerCryptoManager struct {
	*client.CryptoManager
}

func (self *ServerCryptoManager) Delete(client_id string) {

}

func (self *ServerCryptoManager) AddCertificateRequest(csr_pem []byte) (string, error) {
	csr, err := crypto_utils.ParseX509CSRFromPemStr(csr_pem)
	if err != nil {
		return "", err
	}

	if csr.PublicKeyAlgorithm != x509.RSA {
		return "", errors.New("Not RSA algorithm")
	}

	common_name := csr.Subject.CommonName
	public_key := csr.PublicKey.(*rsa.PublicKey)

	// CSRs are always generated by clients and therefore must
	// follow the rules about client id - make sure the client id
	// matches the public key.

	// NOTE: We do not actually sign the CSR at all - since the
	// client is free to generate its own private/public key pair
	// and just uses those to communicate with the server we just
	// store its public key so we can verify its
	// transmissions. The most important thing here is to verfiy
	// that the client id this packet claims to come from
	// corresponds with the public key this client presents. This
	// avoids the possibility of impersonation since the
	// public/private key pair is tied into the client id itself.
	if common_name != crypto_utils.ClientIDFromPublicKey(public_key) {
		return "", errors.New("Invalid CSR")
	}
	err = self.Resolver.SetPublicKey(
		common_name, csr.PublicKey.(*rsa.PublicKey))
	if err != nil {
		return "", err
	}
	return csr.Subject.CommonName, nil
}

func NewServerCryptoManager(
	ctx context.Context,
	config_obj *config_proto.Config,
	wg *sync.WaitGroup) (*ServerCryptoManager, error) {
	if config_obj.Frontend == nil {
		return nil, errors.New("No frontend config")
	}

	cert, err := crypto_utils.ParseX509CertFromPemStr(
		[]byte(config_obj.Frontend.Certificate))
	if err != nil {
		return nil, err
	}

	resolver, err := NewServerPublicKeyResolver(ctx, config_obj, wg)
	if err != nil {
		return nil, err
	}

	base, err := client.NewCryptoManager(config_obj, crypto_utils.GetSubjectName(cert),
		[]byte(config_obj.Frontend.PrivateKey), resolver,
		logging.GetLogger(config_obj, &logging.FrontendComponent))
	if err != nil {
		return nil, err
	}

	server_manager := &ServerCryptoManager{base}

	err = journal.WatchQueueWithCB(ctx, config_obj, wg,
		"Server.Internal.ClientDelete", func(ctx context.Context,
			config_obj *config_proto.Config,
			row *ordereddict.Dict) error {

			logger := logging.GetLogger(config_obj, &logging.FrontendComponent)
			logger.Info("Removing client key from cache because client was deleted  %v\n", row)
			client_id, pres := row.GetString("ClientId")
			if pres {
				server_manager.Delete(client_id)
			}
			return nil
		})

	return server_manager, nil
}

type serverPublicKeyResolver struct {
	config_obj *config_proto.Config
}

func (self *serverPublicKeyResolver) GetPublicKey(
	client_id string) (*rsa.PublicKey, bool) {

	client_path_manager := paths.NewClientPathManager(client_id)
	db, err := datastore.GetDB(self.config_obj)
	if err != nil {
		return nil, false
	}

	pem := &crypto_proto.PublicKey{}
	err = db.GetSubject(self.config_obj,
		client_path_manager.Key(), pem)
	if err != nil {
		return nil, false
	}

	key, err := crypto_utils.PemToPublicKey(pem.Pem)
	if err != nil {
		return nil, false
	}

	return key, true
}

func (self *serverPublicKeyResolver) SetPublicKey(
	client_id string, key *rsa.PublicKey) error {

	client_path_manager := paths.NewClientPathManager(client_id)
	db, err := datastore.GetDB(self.config_obj)
	if err != nil {
		return err
	}

	pem := &crypto_proto.PublicKey{
		Pem:        crypto_utils.PublicKeyToPem(key),
		EnrollTime: uint64(time.Now().Unix()),
	}
	return db.SetSubject(self.config_obj,
		client_path_manager.Key(), pem)
}

func (self *serverPublicKeyResolver) Clear() {}

func NewServerPublicKeyResolver(
	ctx context.Context,
	config_obj *config_proto.Config,
	wg *sync.WaitGroup) (client.PublicKeyResolver, error) {
	result := &serverPublicKeyResolver{
		config_obj: config_obj,
	}

	return result, nil
}
