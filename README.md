# Nightwatch

## Requirements
- Make 3.81
- Python 3.9+
- A Google Cloud project with the Earth Engine API enabled and registered
  for Earth Engine access
- A CARTO basemap API key

## Setup

1. Create a `.env` file in the project directory:
```.env
CARTO_API_KEY=your_carto_key
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
```

2. Run `make`:
```bash
make
```

## Usage

Preparation:
```
# After git cloning and cd'ing into the project...
cd frontend # Crucial
npm i
```

Development:
```
npm run dev
```