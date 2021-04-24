import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import * as bigintConversion from 'bigint-conversion';
import * as bcu from 'bigint-crypto-utils';
import { CifradoAES, CifradoRSA, UsuarioServidor, Mensaje, MensajeServidor, NoRepudio } from '../modelos/modelos';
import { Observable } from 'rxjs';
import { generateKeys, rsaKeyPair, RsaPublicKey } from '../modelos/clave-rsa';
import { keyAES } from '../modelos/modelos-aes';

@Injectable({
  providedIn: 'root'
})
export class ServidorService {

  constructor(private http: HttpClient) { }

  keyAESServidor: keyAES;
  keyRSA: rsaKeyPair;
  keyRSAPublicaServidor: RsaPublicKey;
  keyAES: keyAES;
  r: bigint;

  async getClaves(): Promise<void> {
    const keyAESHex: string = "95442fa551e13eacedea3e79f0ec1e63513cc14a9dbc4939ad70ceb714b44b8f"
    this.keyAESServidor = new keyAES();
    await this.keyAESServidor.setup(new Uint8Array(bigintConversion.hexToBuf(keyAESHex)));
    this.keyRSA = await generateKeys(2048);
    this.http.get<UsuarioServidor>(environment.apiURL + "/rsa").subscribe(data => {
      this.keyRSAPublicaServidor = new RsaPublicKey(bigintConversion.hexToBigint(data.eHex), bigintConversion.hexToBigint(data.nHex));
      this.r = bigintConversion.bufToBigint(window.crypto.getRandomValues(new Uint8Array(16)));
      let enc: Boolean = false;
      while (!enc){
        if (this.r % bigintConversion.hexToBigint(data.nHex) !== 0n)
          enc = true;

        else
          this.r = bigintConversion.bufToBigint(window.crypto.getRandomValues(new Uint8Array(16)));
      }
    }, () => {
      console.log("NO SE HA RECIBIDO LA CLAVE DEL SERVIDOR")
    });
  }

  getkeyRSAPublica(): RsaPublicKey {
    return this.keyRSA.publicKey;
  }
  
  conectar(usuario: string): Observable<UsuarioServidor[]> {
    if (this.keyRSA !== undefined){
      const enviar: UsuarioServidor = {
        nombre: usuario,
        eHex: bigintConversion.bigintToHex(this.keyRSA.publicKey.e),
        nHex: bigintConversion.bigintToHex(this.keyRSA.publicKey.n)
      }
  
      return this.http.post<UsuarioServidor[]>(environment.apiURL + "/conectar", enviar)
    }
    
    else{
      console.log("AÚN NO SE HAN PODIDO GENERAR LAS CLAVES")
    }
  }

  cambiar(usuarios: string[]): Observable<string> {
    const enviar = {
      usuarioAntiguo: usuarios[0],
      usuarioNuevo: usuarios[1]
    }

    return this.http.post<string>(environment.apiURL + "/cambiar", enviar)
  }

  async cifrarRSA(mensaje: Uint8Array): Promise<CifradoRSA> {
    let keyTemporalAES = new keyAES();
    await keyTemporalAES.setup();
    const mensajeCifrado: CifradoAES = await keyTemporalAES.cifrar(mensaje);
    const clave: Uint8Array = await keyTemporalAES.exportarClave();
    const claveCifrada: bigint = this.keyRSAPublicaServidor.encrypt(bigintConversion.bufToBigint(clave))
    const enviar: CifradoRSA = {
      cifrado: mensajeCifrado,
      clave: bigintConversion.bigintToHex(claveCifrada)
    }

    return enviar;
  }

  firmarRSA(digest: bigint): bigint {
    return this.keyRSA.privateKey.sign(digest)
  }

  cegarRSA(digest: bigint): bigint {
    const rCifrado: bigint = this.keyRSAPublicaServidor.encrypt(this.r);
    return bcu.toZn(digest*rCifrado, this.keyRSAPublicaServidor.n)
  }

  descegarRSA(cegado: bigint): bigint {
    const rInverso: bigint = bcu.modInv(this.r, this.keyRSAPublicaServidor.n);
    return bcu.toZn(cegado*rInverso, this.keyRSAPublicaServidor.n)
  }

  verificarRSA(firmar: bigint): bigint {
    return this.keyRSAPublicaServidor.verify(firmar);
  }

  firmarServidor(enviar: Mensaje): Observable<Mensaje> {
    return this.http.post<Mensaje>(environment.apiURL + "/firmar", enviar);
  }

  async cifrarAES(mensaje: Uint8Array): Promise<CifradoAES> {
    const mensajeCifrado: CifradoAES = await this.keyAESServidor.cifrar(mensaje);
    return mensajeCifrado;
  }

  async descifrarAES(cifrado: CifradoAES): Promise<Uint8Array> {
    const descifrado: Uint8Array = await this.keyAESServidor.descifrar(new Uint8Array(cifrado.mensaje), new Uint8Array(cifrado.iv));
    return descifrado;
  }

  enviarCifrado(enviar: MensajeServidor): Observable<MensajeServidor> {
    return this.http.post<MensajeServidor>(environment.apiURL + "/mensaje", enviar);
  }

  enviarClave(enviar: NoRepudio): Observable<NoRepudio> {
    return this.http.post<NoRepudio>(environment.apiURL + "/noRepudio", enviar);
  }
}
