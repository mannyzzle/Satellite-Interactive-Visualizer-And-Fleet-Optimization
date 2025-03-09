
# /backend/app/variables.py
from skyfield.api import load
from datetime import datetime, timedelta
from math import isfinite
from sgp4.api import Satrec, WGS72
from datetime import datetime
import traceback
from astropy.coordinates import TEME, ITRS
from astropy import units as u
from astropy.time import Time
import math
from astropy.utils.iers import conf
conf.iers_auto_url = "https://datacenter.iers.org/data/latest/finals2000A.all"
conf.auto_download = True  # Ensure automatic updates
from astropy.utils import iers
iers.IERS_Auto.open()
ts = load.timescale()
eph = load('de421.bsp')
earth = eph['earth']






def infer_purpose(metadata):
    """
    Infers the purpose of the satellite based on its name, type, and operational status.
    """
    name = metadata.get("OBJECT_NAME", "").upper()
    object_type = metadata.get("OBJECT_TYPE", "").upper()

    # Rocket Bodies
    if object_type in ["R/B", "ROCKET BODY"]:
        return "Rocket Body (Debris)"

    # Debris
    if object_type in ["DEB", "DEBRIS"]:
        return "Space Debris"


    # 🛰️ Starlink Constellation (Distinct Category)
    if "STARLINK" in name:
        return "Starlink Constellation"

    # 🛰️ OneWeb Constellation (Distinct Category)
    if "ONEWEB" in name:
        return "OneWeb Constellation"

    # 🛰️ Iridium NEXT Constellation (Distinct Category)
    if "IRIDIUM" in name:
        return "Iridium NEXT Constellation"

        # 🌐 **Traditional Communications Satellites**  
    if any(keyword in name for keyword in [
        "SES", "INTELSAT", "VIASAT", "EUTELSAT", "INMARSAT", "THURAYA", "HUGHES",
        "O3B", "JCSAT", "SKYNET", "TDRS", "ANIK", "ASTRA", "TELSTAR", "TDRSS", "ECHO",
        "MARISAT", "OPTUS", "CHINASAT", "YAMAL", "LORAL", "AMOS", "SHINASAT", "TELKOM", "GSAT",
        "TIBA", "KACIFIC", "HYLAS", "NBN", "NORSAT", "SESAT", "JUPITER", "TURKSAT", "ARABSAT",
        "NILESAT", "TANGO", "ABS", "KA-SAT", "CINAHASAT", "ST-2", "MEASAT", "BULSATCOM",
        "ECO-STAR", "SPACEWAY", "EUTELSAT KONNECT", "SES-4", "SYRACUSE", "TAMPA", "ECO-1",
        "VHTS", "VINASAT", "ES'HAIL", "JDRS", "SIRIUS", "GALAXY", "STARONE", "AUSSAT",
        "C-COM", "MOLNIYA", "ECHO", "HORIZONS", "INTELBIRD", "TELENOR", "MERCURY",
        "WGS", "EQUANT", "SES-17", "SES-22", "TURKSAT 5A", "TURKSAT 5B", "GSAT-30",
        "TURKSAT-6A", "THAICOM", "ASTARTE", "ORBCOMM", "TERRASAR", "HISPASAT",
        "GLOBALSTAR", "TIANMU-", "ZHONGXING-", "KOREASAT", "APSTAR-", "TIANLIAN",
        "ASIASAT", "DIRECTV", "EXPRESS-AM", "NIMIQ", "SATELIOT", "BSAT-", "MUOS-",
        "AMAZONAS", "HELLAS-SAT", "TIANTONG-", "QZS-", "YAHSAT", "TURKMENALEM", "XM-", "HELLAS-SAT", "DUBAISAT-", "COMSATBW-", "EXPRESS-AT", "ARSAT", "RADUGA-", "YAHSAT", "XM-", 
        "EXPRESS-AMU", "ASIASTAR"

    ]):
        return "Communications"




    # 📡 **Navigation Satellites**  
    if any(keyword in name for keyword in [
        "GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR", "QZSS", "COSPAS-SARSAT", "IRNSS",
        "COMPASS", "EGNOS", "WAAS", "MSAS", "GAGAN", "DORIS", "LAGEOS", "NANJING", "ZHY",
        "TUPL", "BDS", "NASS", "NAVIC", "DRAGONFLY", "MICROSCOPE", "PRN", "KASS",
        "PAS-10", "OMNISTAR", "DORIS-2", "NAVSTAR-66", "PAS-12", "NAVIC-9", "GLONASS-K", "TIANMU-", "QZS-", "GNOMES-", "POLAR", "CSC-", "LEO"


    ]):
        return "Navigation"



    # 🌦️ **Weather Monitoring Satellites**  
    if any(keyword in name for keyword in [
        "WEATHER", "METEOR", "NOAA", "GOES", "HIMAWARI", "METOP", "DMSP", "FENGYUN", "GOMS",
        "INSAT", "SCATSAT", "TIROS", "NIMBUS", "GPM", "SMAP", "TROPICS", "OMI", "OCO", "COSMIC",
        "JPSS", "SUOMI", "HY-2", "FY-4", "SEVIRI", "MTSAT", "NPOESS", "NSCAT", "CALIPSO",
        "CLOUDSAT", "GCOM", "GOSAT", "I-5 F4", "MSG-3", "MSG-4", "SCISAT", "OMPS", "LAGRANGE-1",
        "CYGNSS", "AURA", "GOSAT-2", "GRACE-FO", "SMOS", "TANSAT", "GRACE", "OCO-3", "VIIRS",
        "JASON", "CRYOSAT", "AMSR", "TRMM", "ERS", "ENVISAT", "OZONE", "HAIYANG-", "TIANHUI", "HJ-", "FGRST (GLAST)", "OCEANSAT-", "S-NET", "CYGFM", "MDASAT-", "HULIANWAN", "HULIANGWANG", "YUNYAO-", "FARADAY", "DAQI"


    ]):
        return "Weather Monitoring"




    # 🛰️ **Military & Reconnaissance Satellites**  
    if any(keyword in name for keyword in [
        "SPY", "NROL", "RECON", "USA", "KH-11", "ONYX", "LACROSSE", "MISTY", "DIA", "SATCOM",
        "DSP", "ORION", "SBIRS", "ADVANCED", "MILSTAR", "SICRAL", "YAOGAN", "GEO-IK", "TITAN",
        "GRU", "ZUMA", "GAOFEN", "JL-1", "JL-2", "XHSAT", "SHIJIAN", "NAVY", "ARSENAL",
        "GRUMMAN", "KOSMOS", "SICH", "RORSAT", "SATCOM", "QIAN", "TIANCHENG", "SPIRA",
        "TITAN-2", "ORION-5", "GEO-11", "FIREBIRD", "EWS", "MUSIS", "UFO", "AEHF", "KOSMOS-2549",
        "ALOUETTE", "ORBIT-1", "ZONAL", "SKYMED", "KOMETA", "GOVSAT", "VORTEX", "NOSS", "SHIYAN", "TIANQI", "YUNHAI-", "SJ-", "GHOST-", "LUCH-", "GNOMES-", "RISAT-", "BLACKJACK", 
        "TIANTONG-", "ORS-", "ION", "SKYKRAFT-", "ZHEDA PIXING-", "RADUGA-", "SWARM", "CSG-", 
        "NINGXIA-", "TJS-", "MUOS-", "UMBRA-", "LEGION", "BRO-", "CHECKMATE", "GJZ", "GEESAT-", "TIANTONG-", "ZIYUAN", "RISAT-", "KL-BETA", "KAZSAT-", 
        "GOKTURK", "ZHIHUI", "YARILO", "HUANJING", "SPARK", "XW-", "KONDOR-FKA", "KL-ALPHA", 
        "ELSA-D", "EROS"


    ]):
        return "Military/Reconnaissance"



    # 🏞️ **Earth Observation Satellites**  
    if any(keyword in name for keyword in [
        "EARTH", "SENTINEL", "LANDSAT", "TERRA", "AQUA", "SPOT", "RADARSAT", "ICEYE", "PLEIADES",
        "CARTOSAT", "KOMPSAT", "NUSAT", "HYSIS", "HYPERSAT", "CUBESAT", "BLACKSKY", "PLANET",
        "WORLDVIEW", "QUICKBIRD", "ORBVIEW", "DOVE", "SKYSAT", "BIRD", "RESURS", "PHOTON",
        "VHR", "EOSAT", "LAGEOS", "TANDEM", "PAZ", "SWOT", "TET-1", "GEOEYE", "FASAT", "KASAT",
        "TUBIN", "VNREDSAT", "HYPERSAT-2", "MOROCCO", "NUSAT-7", "HYPSO", "RESOURCESAT",
        "IKONOS", "THEOS", "SIRIS", "IRS", "OHSAT", "HISUI", "PLEIADES-NEO", "BILSAT",
        "FLOCK", "SPECTRA", "AEROSAT", "SARSAT", "GRACE-2", "CHRIS", "MOS-1", "LEMUR-", "JILIN-", "GONETS-M", "HEAD-", "SUPERVIEW", "FORMOSAT", "EOS-", "ZIYUAN", 
        "ALSAT", "KANOPUS-V", "DMC", "KONDOR-FKA", "CAPELLA-", "TISAT", "QUETZSAT", "BEIJING", 
        "RSW-", "EROS", "ZHUHAI-", "EOS-", "DMC", "CANX-", "ELEKTRO-L", "SUPERVIEW-", "PRSS", "TELEOS-", "KANOPUS-V-IK", 
        "SHARJAHSAT-", "CASSIOPE", "PRISMA", "SOCRATES", "DS-EO"


    ]):
        return "Earth Observation"




        # 🔬 **Scientific Research Satellites**
    if any(keyword in name for keyword in [
        "HUBBLE", "JWST", "X-RAY", "FERMI", "GAIA", "KEPLER", "TESS", "WISE", "SPITZER",
        "MRO", "MAVEN", "INSIGHT", "DAWN", "BICEP", "XMM-NEWTON", "SWIFT", "GEMS",
        "NUSTAR", "PLATO", "SPICA", "GONG", "HELIO", "MAGELLAN", "CHANDRA", "ULYSSES",
        "HITOMI", "SUNRISE", "HELIOPHYSICS", "KECK ARRAY", "NICER", "GONG", "HELIOS",
        "SOLAR-B", "BICEP ARRAY", "JAMES WEBB", "QUANTUM", "XMM", "ASTRO-H", "LARES",
        "IRIS", "MICE", "SDO", "PROBA-", "CORIOLIS", "JAS-", "TIMED", "BIROS", "SAPPHIRE", "RADFXSAT", 
        "ITASAT", "ASNARO-", "BIROS", "CHEOPS", "LOPEN", "SPARTAN", "WEINA", "KANOPUS-V-IK", "INTEGRAL"


    ]):
        return "Scientific Research"



    # 🛠️ **Technology Demonstration Satellites**
    if any(keyword in name for keyword in [
        "EXPERIMENT", "TEST", "TECHNOLOGY", "DEMO", "TECHSAT", "PROTOTYPE", "MICROSAT",
        "NANOSAT", "RAVAN", "ECHO", "VCLS", "CUBERIDER", "FIREBIRD", "COPPER", "OSCAR",
        "ICECUBE", "DISCOSAT", "GOMX", "GOMX-4", "EQUULEUS", "PICSAT", "CANYVAL-X",
        "INSPIRATION", "NANORACKS", "CENTISPACE-", "XJS-", "AEROCUBE", "LDPE-", "LINUSS", "OMNI-L", "TIGRISAT", "SMDC", 
        "LEMUR-2", "ASTROCAST-", "KINEIS-", "NEXTSAT-", "CENTAURI-", "GOKTURK", "STAR-", "APRIZESAT", "PICO-", "AAC-AIS-SAT", "RCM-", "LDPE-", "CORVUS", "SXM-", "PREFIRE-", 
        "QB", "SCD", "IONOSFERA-M", "PROMETHEUS", "CSG-", "LINGQIAO", "MOHAMMED", "AYRIS-", "TACSAT", 
        "MANDRAKE", "OPS", "CUTE-", "CLUSTER", "OMNI-L", "ALOS-", "RSW-", "LAPAN-A", "VIGORIDE-", 
        "SINOD-D", "VRSS-", "DRUMS", "PROGRESS-MS", "PEARL", "UNISAT-", "NANOFF", "ANSER-FLW", 
        "LINUSS", "JACKAL", "AETHER-", "FOX-", "XJS", "FALCONSAT-", "CS", "CAPELLA-", "UWE-", 
        "PLATFORM-", "NUVIEW", "GUANGCHUAN", "SDX", "POEM-", "PROPCUBE", "CENTAURI-", "MH-", 
        "ORESAT", "WNISAT", "EXO-", "CUBEBUG-", "SEDNA-", "GENMAT-", "HIBARI", "HYPERFIELD-", 
        "MKA-PN", "CUAVA-", "RADFXSAT", "OTB", "STARS", "EDRS-C", "TANAGER-", "ONGLAISAT", 
        "MONOLITH", "INTEGRAL", "EXCITE", "TYCHE", "ADRAS-J", "NINJASAT", "RROCI-", "ROCK", 
        "OOV-CUBE", "STEP", "LACE-", "RANDEV"


    ]):
        return "Technology Demonstration"



    # 🚀 **Human Spaceflight / Crewed Missions**
    if any(keyword in name for keyword in [
        "ISS", "CREW", "TIANGONG", "SHENZHOU", "SOYUZ", "DRAGON", "STARLINER", "APOLLO",
        "GAGANYAAN", "ARTEMIS", "COLUMBIA", "CHALLENGER", "SATURN V", "ORION", "VOSTOK",
        "MERCURY", "GEMINI", "ZVEZDA", "UNITY", "TRANQUILITY", "MIR", "LUNAR MODULE",
        "SPACEX", "DEARMOON", "BOEING CST-100", "BLUE ORIGIN", "SPACESHIPTWO", "X-37B", "CSS", "ISS Modules (MENGTIAN, TIANHE, WENTIAN)"

    ]):
        return "Human Spaceflight"



    # 🛰️ **Space Infrastructure (Relay, Experimental, Interplanetary)**
    if any(keyword in name for keyword in [
        "TDRS", "RELAY", "GEO-COM", "LAGRANGE", "LUCY", "HAYABUSA", "MARS", "VENUS",
        "JUPITER", "SATURN", "PLUTO", "KUIPER", "DEEP SPACE", "EXPLORER", "MOON", "LUNAR",
        "INSIGHT", "ODYSSEY", "MAVEN", "BEPICOLOMBO", "GAGANYAAN", "HERMES", "MERCURY",
        "SOLAR ORBITER", "LUNAR PATHFINDER", "LUNAR RECONNAISSANCE ORBITER", "HORIZONS",
        "SELENE", "MARS PATHFINDER", "CURIOSITY", "OPPORTUNITY", "SPIRIT", "ROSCOSMOS",
        "JAXA", "TIANWEN", "VIPER", "GATEWAY", "CALLISTO", "SPACEBUS", "MARS SAMPLE RETURN", "CSS", "TIANLIAN", "XW-", "EXPRESS-AT", "SPACEBEE-", "CSS", "TIANLIAN"


    ]):
        return "Space Infrastructure"



    # 🚗 **Satellite Servicing & Logistics (Tugs, Refueling, Reboost)**
    if any(keyword in name for keyword in [
        "MEV", "MISSION EXTENSION", "TUG", "SATELLITE SERVICING", "ORBIT TRANSFER",
        "ORBIT FAB", "RENDEZVOUS", "FUEL DEPOT", "OSAM", "POD", "REPAIR", "RESTORE",
        "SPACE DRAG", "IN-ORBIT REFUELING", "ACTIVE DEBRIS REMOVAL", "MISSION REBOOST",
        "SHERPA", "EXTENSION VEHICLE", "GEO SERVICING", "DEORBIT", "ON-ORBIT REPAIR", "ELSA-D", "PROX-", "ORBASTRO-AF"

    ]):
        return "Satellite Servicing & Logistics"



    # 🌌 **Deep Space Exploration Missions (Interplanetary & Lunar)**
    if any(keyword in name for keyword in [
        "VOYAGER", "PIONEER", "NEW HORIZONS", "ULYSSES", "CASSINI", "JUNO", "BEPICOLOMBO",
        "MAVEN", "MARS EXPRESS", "VENUS EXPRESS", "MAGELLAN", "AKATSUKI", "VENERA",
        "MARINER", "GALILEO", "ODYSSEY", "INSIGHT", "JUPITER ICY MOONS", "GANYMEDE",
        "EUROPA", "TITAN", "DRAGONFLY", "LUNAR RECONNAISSANCE", "CHANG'E", "LUNA",
        "LUNOKHOD", "APOLLO", "ARTEMIS", "SMART-1", "KAGUYA", "SELENE", "YUTU", "VIPER",
        "LUNAR PATHFINDER", "LUNAR GATEWAY", "CAPSTONE", "EXOMARS", "TITAN SATURN SYSTEM MISSION", "MMS", "THOR", "HST", "CXO", "EYESAT", "RADIO ROSTO (RS-15)"

    ]):
        return "Deep Space Exploration"


    # 🛑 Default classifications
    if object_type == "PAYLOAD":
        return "Unknown Payload"
    

    return "Unknown"









# Extract epoch from TLE Line 1
def extract_epoch(tle_line1):
    """
    Extracts epoch (timestamp) from the first TLE line.
    """
    try:
        year = int(tle_line1[18:20])
        day_of_year = float(tle_line1[20:32])
        year += 2000 if year < 57 else 1900  # Handling 2-digit years
        return datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
    except Exception as e:
        print(f"❌ Error extracting epoch: {e}")
        return None






# Parse TLE Line 1
def parse_tle_line1(tle_line1):
    """
    Extracts NORAD number, International Designator, and Ephemeris Type from TLE Line 1.
    """
    try:
        norad_number = int(tle_line1[2:7].strip())  # Extract NORAD ID
        intl_designator = tle_line1[9:17].strip()  # Extract International Designator
        ephemeris_type = int(tle_line1[62:63].strip())  # Extract Ephemeris Type
        return norad_number, intl_designator, ephemeris_type
    except Exception as e:
        #print(f"❌ Error parsing TLE Line 1: {e}")
        return None, None, None





def parse_tle_line2(tle_line2):
    """
    Extracts Mean Motion and Revolution Number from TLE Line 2.
    """
    try:
        mean_motion = float(tle_line2[52:63].strip())  # Extract Mean Motion
        rev_number = int(tle_line2[63:68].strip())  # Extract Revolution Number

        # 🔍 Debugging: Print extracted values
        #print(f"🔎 Parsed Mean Motion: {mean_motion}, Rev Number: {rev_number}")

        if not isfinite(mean_motion) or mean_motion <= 0:
            print(f"⚠️ Invalid Mean Motion ({mean_motion}), skipping.")
            return None, None
        return mean_motion, rev_number

    except Exception as e:
        print(f"❌ Error parsing TLE Line 2: {e}")
        return None, None





def compute_orbital_params(name, tle_line1, tle_line2):
    """
    Compute all possible orbital parameters strictly at the TLE epoch 
    using python-sgp4 + Astropy.
    """
    try:
        if not tle_line1 or not tle_line2:
            #print(f"⚠️ Skipping {name}: Missing TLE data")
            return None

        satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)

        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)
        mean_motion, rev_num = parse_tle_line2(tle_line2)
        epoch = extract_epoch(tle_line1)

        if None in [norad_number, mean_motion, epoch]:
            #print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid TLE data.")
            return None

        # Convert epoch to Julian Date
        tle_epoch_time = Time(epoch, scale="utc")
        jd_total = tle_epoch_time.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd  

        # 4) Extract SGP4 Model Parameters
        inclination = satrec.inclo * (180 / math.pi)  
        eccentricity = satrec.ecco
        bstar = satrec.bstar
        raan = satrec.nodeo * (180 / math.pi)  
        arg_perigee = satrec.argpo * (180 / math.pi)  

        mu = 398600.4418  
        n_rad_s = mean_motion * 2 * math.pi / 86400.0
        semi_major_axis = (mu / (n_rad_s**2)) ** (1 / 3)  

        perigee = semi_major_axis * (1 - eccentricity) - 6378.0  
        apogee  = semi_major_axis * (1 + eccentricity) - 6378.0
        period = (1.0 / mean_motion) * 1440.0  

        orbit_type = classify_orbit_type(perigee, apogee)

        error_code, r_teme, v_teme = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"⚠️ [SGP4 Error {error_code}] for {name} (NORAD {norad_number}) at epoch {epoch}")
            return None

        teme_coord = TEME(
            x=r_teme[0] * u.km,
            y=r_teme[1] * u.km,
            z=r_teme[2] * u.km,
            obstime=tle_epoch_time
        )
        itrs_coord = teme_coord.transform_to(ITRS(obstime=tle_epoch_time))
        lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
        lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
        alt_km  = itrs_coord.earth_location.height.to(u.km).value

        vx, vy, vz = v_teme  
        velocity = math.sqrt(vx**2 + vy**2 + vz**2)  

        # Additional Computations
        mean_anomaly = satrec.mo * (180 / math.pi)  
        eccentric_anomaly = mean_anomaly + (eccentricity * math.sin(mean_anomaly))  
        true_anomaly = 2 * math.atan2(math.sqrt(1 + eccentricity) * math.sin(eccentric_anomaly / 2),
                                      math.sqrt(1 - eccentricity) * math.cos(eccentric_anomaly / 2))  
        argument_of_latitude = arg_perigee + true_anomaly  
        specific_angular_momentum = math.sqrt(mu * semi_major_axis * (1 - eccentricity**2))  
        radial_distance = semi_major_axis * (1 - eccentricity * math.cos(eccentric_anomaly))  
        flight_path_angle = math.atan((eccentricity * math.sin(true_anomaly)) / (1 + eccentricity * math.cos(true_anomaly)))  
        
        if vx is None or vy is None or vz is None:
            #print(f"❌ [ERROR] Missing velocity for {name} (NORAD {norad_number})")
            return None


        return {
            "norad_number": norad_number,
            "intl_designator": intl_designator,
            "ephemeris_type": ephemeris_type,
            "epoch": epoch,
            "inclination": inclination,
            "eccentricity": eccentricity,
            "mean_motion": mean_motion,
            "raan": raan,
            "arg_perigee": arg_perigee,
            "period": period,
            "semi_major_axis": semi_major_axis,
            "perigee": perigee,
            "apogee": apogee,
            "velocity": velocity,
            "orbit_type": orbit_type,
            "bstar": bstar,
            "rev_num": rev_num,
            "latitude": lat_deg,
            "longitude": lon_deg,
            "altitude_km": alt_km,  # Now at TLE epoch
            "x": r_teme[0],  # TEME Position X (km)
            "y": r_teme[1],  # TEME Position Y (km)
            "z": r_teme[2],  # TEME Position Z (km)
            "vx": vx,  # TEME Velocity X (km/s)
            "vy": vy,  # TEME Velocity Y (km/s)
            "vz": vz,  # TEME Velocity Z (km/s)
            "mean_anomaly": mean_anomaly,  # Mean anomaly (deg)
            "eccentric_anomaly": eccentric_anomaly,  # Eccentric anomaly (deg)
            "true_anomaly": true_anomaly,  # True anomaly (deg)
            "argument_of_latitude": argument_of_latitude,  # Argument of latitude (deg)
            "specific_angular_momentum": specific_angular_momentum,  # Specific angular momentum (km²/s)
            "radial_distance": radial_distance,  # Distance from Earth's center (km)
            "flight_path_angle": flight_path_angle,  # Angle between velocity vector and orbital plane (deg)
        }

    except Exception as e:
        #print(f"❌ Error: {e}")
        traceback.print_exc()
        return None



# Classify orbit type
def classify_orbit_type(perigee, apogee):
    """
    Determines orbit classification based on perigee and apogee altitudes.
    """
    avg_altitude = (perigee + apogee) / 2
    if avg_altitude < 2000:
        return "LEO"  # Low Earth Orbit
    elif 2000 <= avg_altitude < 35786:
        return "MEO"  # Medium Earth Orbit
    elif 35786 <= avg_altitude <= 35792:
        return "GEO"  # Geostationary Orbit
    else:
        return "HEO"  # Highly Elliptical Orbit

