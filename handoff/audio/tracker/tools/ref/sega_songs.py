"""ROM locations of the four Sega songs (same as tools/faithful.py) -> smps_drv.Driver"""
import struct,os,sys
sys.path.insert(0,os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'sega'))
import smps_drv as D
SONIC='/workspace/sonic'
_R={}
def rom(n):
    if n not in _R: _R[n]=open(os.path.join(SONIC,n),'rb').read()
    return _R[n]
def driver(job):
    if job=='sonic1-starlight':
        r=rom('sonic1rev1.bin'); return D.Driver(r,'s1',struct.unpack_from('>I',r,0x71a9c+12)[0]),'s1'
    if job in ('sonic3-icecap','sonic3-launchbase'):
        r=rom('sonic3.bin'); idx=10 if 'icecap' in job else 12
        bank=0x10|(r[0xe6b48+idx]&0x0F); ptr=struct.unpack_from('<H',r,0xe761a+2*idx)[0]
        return D.Driver(r,'s3k',bank*0x8000+ptr-0x8000,bank,tabvar='s3'),'s3'
    if job=='sk-mushroomhill':
        r=rom('knuckles.bin'); return D.Driver(r,'s3k',0x1D*0x8000+0x8AFE-0x8000,0x1D,tabvar='sk'),'sk'
KIT={'s1':'s1','s3':'s3','sk':'sk'}
