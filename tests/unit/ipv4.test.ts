import { describe, expect, it } from 'vitest';
import {
  broadcastAddress,
  formatCidr,
  hostAddressError,
  intToIp,
  ipInSubnet,
  ipToInt,
  ipv4Class,
  isPrivateIp,
  isValidIpv4,
  isValidSubnetMask,
  maskToPrefix,
  networkAddress,
  networkAndHostPortions,
  parseCidr,
  parseMaskInput,
  prefixToMask,
  sameSubnet,
  subnetDetails
} from '../../src/utils/ipv4';

describe('IPv4 conversion', () => {
  it('converts dotted decimal addresses to integers and back', () => {
    expect(ipToInt('0.0.0.0')).toBe(0);
    expect(ipToInt('192.168.1.10')).toBe(3232235786);
    expect(ipToInt('255.255.255.255')).toBe(4294967295);
    expect(intToIp(3232235786)).toBe('192.168.1.10');
    expect(intToIp(0)).toBe('0.0.0.0');
  });

  it('rejects malformed addresses', () => {
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('192.168.1.256')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false);
    expect(isValidIpv4(' 192.168.1.1 ')).toBe(true);
    expect(isValidIpv4('not-an-ip')).toBe(false);
  });

  it('classifies private ranges', () => {
    expect(isPrivateIp('10.2.3.4')).toBe(true);
    expect(isPrivateIp('172.16.5.5')).toBe(true);
    expect(isPrivateIp('172.32.5.5')).toBe(false);
    expect(isPrivateIp('192.168.0.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('reports the historical address class', () => {
    expect(ipv4Class('10.0.0.1')).toBe('A');
    expect(ipv4Class('172.16.0.1')).toBe('B');
    expect(ipv4Class('192.168.1.1')).toBe('C');
    expect(ipv4Class('224.0.0.1')).toBe('D');
    expect(ipv4Class('240.0.0.1')).toBe('E');
  });
});

describe('subnet masks', () => {
  it('converts between masks and prefixes', () => {
    expect(maskToPrefix('255.255.255.0')).toBe(24);
    expect(maskToPrefix('255.255.255.192')).toBe(26);
    expect(maskToPrefix('255.255.255.255')).toBe(32);
    expect(maskToPrefix('0.0.0.0')).toBe(0);
    expect(maskToPrefix('255.0.255.0')).toBeNull();
    expect(prefixToMask(24)).toBe('255.255.255.0');
    expect(prefixToMask(26)).toBe('255.255.255.192');
    expect(prefixToMask(0)).toBe('0.0.0.0');
  });

  it('validates contiguous subnet masks only', () => {
    expect(isValidSubnetMask('255.255.254.0')).toBe(true);
    expect(isValidSubnetMask('255.255.255.1')).toBe(false);
    expect(isValidSubnetMask('255.0.255.0')).toBe(false);
  });

  it('parses dotted masks and prefix shorthand', () => {
    expect(parseMaskInput('255.255.255.0')).toBe('255.255.255.0');
    expect(parseMaskInput('/26')).toBe('255.255.255.192');
    expect(parseMaskInput('26')).toBe('255.255.255.192');
    expect(parseMaskInput('33')).toBeNull();
    expect(parseMaskInput('255.255.0.255')).toBeNull();
  });

  it('parses and formats CIDR notation', () => {
    expect(parseCidr('192.168.1.10/24')).toEqual({
      ip: '192.168.1.10',
      mask: '255.255.255.0',
      prefix: 24
    });
    expect(parseCidr('192.168.1.10/33')).toBeNull();
    expect(parseCidr('192.168.1.10')).toBeNull();
    expect(formatCidr('192.168.1.10', '255.255.255.192')).toBe('192.168.1.10/26');
  });
});

describe('subnet calculations', () => {
  it('computes network and broadcast addresses', () => {
    expect(networkAddress('192.168.1.130', '255.255.255.192')).toBe('192.168.1.128');
    expect(broadcastAddress('192.168.1.130', '255.255.255.192')).toBe('192.168.1.191');
    expect(networkAddress('10.0.0.5', '255.0.0.0')).toBe('10.0.0.0');
  });

  it('compares membership in the same subnet', () => {
    expect(sameSubnet('192.168.1.10', '192.168.1.200', '255.255.255.0')).toBe(true);
    expect(sameSubnet('192.168.1.10', '192.168.2.10', '255.255.255.0')).toBe(false);
    expect(ipInSubnet('192.168.1.130', '192.168.1.128', '255.255.255.192')).toBe(true);
    expect(ipInSubnet('192.168.1.192', '192.168.1.128', '255.255.255.192')).toBe(false);
  });

  it('describes a /26 subnet', () => {
    const details = subnetDetails('192.168.1.130', '255.255.255.192');
    expect(details).not.toBeNull();
    expect(details).toMatchObject({
      network: '192.168.1.128',
      broadcast: '192.168.1.191',
      firstHost: '192.168.1.129',
      lastHost: '192.168.1.190',
      usableHosts: 62,
      prefix: 26
    });
  });

  it('rejects network and broadcast addresses as host addresses', () => {
    expect(hostAddressError('192.168.1.0', '255.255.255.0')).toBe('This is the network address');
    expect(hostAddressError('192.168.1.255', '255.255.255.0')).toBe('This is the broadcast address');
    expect(hostAddressError('192.168.1.10', '255.255.255.0')).toBeNull();
    expect(hostAddressError('192.168.1.10', '255.255.255.256')).toBe('Invalid address or mask');
  });

  it('splits addresses into network and host portions', () => {
    expect(networkAndHostPortions('192.168.1.130', '255.255.255.192')).toEqual({
      network: '192.168.1.128',
      host: '0.0.0.2'
    });
  });
});
